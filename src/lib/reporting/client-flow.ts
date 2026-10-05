import type { Figure } from "./formulas.ts";

/**
 * How many clients a business had at the start of a month (§5.8).
 *
 * §5.8 says two incompatible things: its table calls "Active clients at
 * start" *pulled* from last month's "active at end", and its prose says the
 * very first month asks for it as a one-off input. The schema enforces the
 * first — `report_values` refuses to store a value for a pulled metric
 * (`guard_report_value_metric`) — so in a client's first month the figure
 * could never be filled, and retention, churn, upsell and active-at-end were
 * null for that month and every month after it.
 *
 * **A separate opening figure, typed once** (Nina via Dom, 5 October 2026):
 * `client_experience_clients_at_start_opening`, which is a `core` metric and
 * therefore storable. Every later month carries on from the month before.
 *
 * Carrying on means adding up what happened in between rather than asking
 * last month what it concluded, because last month's conclusion is itself
 * calculated from the month before that. One pass over the months, no
 * recursion:
 *
 *     start(M) = opening + Σ (new clients − clients who left) for every
 *                month from the opening month up to, but not including, M
 *
 * Pure, so the arithmetic that decides four other figures can be tested
 * without a database.
 */

export interface MonthFlow {
  /** `YYYY-MM-DD`, first of the month. */
  month: string;
  /** The typed opening figure, on the months that have one. */
  opening?: Figure;
  /** New clients that month — pulled from Leads & Conversions. */
  newClients?: Figure;
  clientsWhoLeft?: Figure;
}

export interface OpeningFigure {
  month: string;
  value: number;
}

/**
 * Which opening figure counts, and which are sitting there unused.
 *
 * **The earliest one wins** (Dom, 5 October). The rule is "earliest stored",
 * not "the workspace's first month", so moving a client's first month
 * earlier or later cannot silently blank the chain that every retention
 * figure hangs off.
 *
 * The others are returned rather than discarded, because a figure that is
 * quietly ignored is worse than one that is wrong: the entry screen says
 * which is in use and marks the rest.
 */
export function openingFigures(flow: MonthFlow[]): {
  inUse: OpeningFigure | null;
  unused: OpeningFigure[];
} {
  const stored = flow
    .filter((m): m is MonthFlow & { opening: number } =>
      typeof m.opening === "number" && Number.isFinite(m.opening),
    )
    .map((m) => ({ month: m.month, value: m.opening }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { inUse: stored[0] ?? null, unused: stored.slice(1) };
}

/**
 * Active clients at the start of `month`.
 *
 * Null before the opening figure's own month, and null when there is no
 * opening figure at all — which is the honest answer and the one the screen
 * already knows how to draw as a dash.
 *
 * A month in between with nothing entered contributes nothing rather than
 * breaking the chain. These two are counts of events, so "no figure entered
 * for August" most plausibly means none happened; the alternative is one
 * forgotten field turning every later month's retention into a dash. The
 * entry screen shows the carried figure, so a wrong one is visible rather
 * than buried.
 */
export function activeClientsAtStart(flow: MonthFlow[], month: string): Figure {
  const { inUse } = openingFigures(flow);
  if (!inUse) return null;
  if (month < inUse.month) return null;

  const between = flow
    .filter((m) => m.month >= inUse.month && m.month < month)
    .sort((a, b) => a.month.localeCompare(b.month));

  return between.reduce((running, m) => {
    const joined = typeof m.newClients === "number" ? m.newClients : 0;
    const left = typeof m.clientsWhoLeft === "number" ? m.clientsWhoLeft : 0;
    return running + joined - left;
  }, inUse.value);
}
