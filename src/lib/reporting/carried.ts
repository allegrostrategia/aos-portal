import type { Figure } from "./formulas.ts";

/**
 * What a month was published with, frozen onto that month.
 *
 * A published report should not change because an earlier month was
 * edited, and today it does: a client's figures are computed from the
 * months **they** can read, so taking July back to draft empties part of a
 * published August they still have open. `docs/freeze-plan.md` has the
 * measurement; decisions 1, 2 and 3 were approved by Dom on 7 October.
 *
 * Three rules this file exists to keep in one place:
 *
 *   · **Only what comes from OTHER months or from outside the month.** This
 *     month's own `report_values` are already held still by the published-
 *     month lock, so copying them here would be a second copy to keep in
 *     step — and the first thing to drift.
 *   · **Stored, never recomputed on read.** The whole point is that the
 *     answer does not depend on who is asking or on what has happened
 *     since.
 *   · **Missing is not zero.** A snapshot with no entry for a figure reads
 *     as a dash, the same as a figure nobody entered. `{}` on an older
 *     month means "nothing was frozen", which is what a backfill looks for.
 */

/** `metric_key|entity_id`, the form `ValueBag` already keys on. */
export type ValueKey = string;

export interface Carried {
  /**
   * §5.8's opening-figure chain, resolved. Both months, because the arrows
   * on Client Experience compare against last month, and last month's
   * start is as derived as this one's.
   */
  clientsAtStart: number | null;
  previousClientsAtStart: number | null;
  /** The previous month's figures, for every "vs. last month" comparison. */
  previous: Record<ValueKey, number | null>;
  /** §7's bar and "is at 40% of your target" — a sentence in the report. */
  targets: Record<ValueKey, number>;
  /** What the traffic lights were drawn against. */
  benchmarks: Record<string, number>;
  /**
   * The workspace-level settings that change a published figure: the row
   * labels, and a campaign's goal, which decides whose spend counts towards
   * cost per lead (§10.2 — £4.50 honest against £6.00 blended).
   */
  entities: Record<string, { name: string; goal: string | null }>;
}

export const EMPTY_CARRIED: Carried = {
  clientsAtStart: null,
  previousClientsAtStart: null,
  previous: {},
  targets: {},
  benchmarks: {},
  entities: {},
};

/**
 * Read a snapshot off a period row.
 *
 * Returns null for a month that has none — an older month before the
 * backfill, or a draft. **Null and `EMPTY_CARRIED` mean different things**
 * and the caller must not conflate them: null is "fall back to the live
 * walk", empty is "this month genuinely carried nothing".
 *
 * Defensive about the shape because jsonb is not validated by the database
 * — decision 1's one real cost. A snapshot written by an older version of
 * this file should degrade to the live walk rather than throw on a page a
 * client is reading.
 */
export function readCarried(carried: unknown): Carried | null {
  if (!carried || typeof carried !== "object" || Array.isArray(carried)) return null;
  const raw = carried as Record<string, unknown>;
  // `{}` is the column default, so it is how every month looks before it is
  // ever published. Nothing was frozen; use the live walk.
  if (Object.keys(raw).length === 0) return null;

  const numbers = (v: unknown): Record<string, number> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  };
  const nullableNumbers = (v: unknown): Record<string, number | null> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, n]) => n === null || typeof n === "number")
        .map(([k, n]) => [k, n as number | null]),
    );
  };
  const figure = (v: unknown): number | null => (typeof v === "number" ? v : null);

  const entities: Carried["entities"] = {};
  if (raw.entities && typeof raw.entities === "object" && !Array.isArray(raw.entities)) {
    for (const [id, row] of Object.entries(raw.entities as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.name !== "string") continue;
      entities[id] = { name: r.name, goal: typeof r.goal === "string" ? r.goal : null };
    }
  }

  return {
    clientsAtStart: figure(raw.clientsAtStart),
    previousClientsAtStart: figure(raw.previousClientsAtStart),
    previous: nullableNumbers(raw.previous),
    targets: numbers(raw.targets),
    benchmarks: numbers(raw.benchmarks),
    entities,
  };
}

/**
 * Assemble the snapshot for a month that is about to be published.
 *
 * Pure, so the publish action, the backfill and the tests all build it the
 * same way — §9's rule that two implementations of the same arithmetic will
 * disagree, applied before there are two.
 */
export function buildCarried(input: {
  clientsAtStart: Figure;
  previousClientsAtStart: Figure;
  /** Every figure of the previous month, keyed `metric_key|entity_id`. */
  previous: Record<ValueKey, number | null>;
  targets: Record<ValueKey, number>;
  benchmarks: Record<string, number>;
  entities: { id: string; name: string; campaign_goal: string | null }[];
}): Carried {
  return {
    clientsAtStart: typeof input.clientsAtStart === "number" ? input.clientsAtStart : null,
    previousClientsAtStart:
      typeof input.previousClientsAtStart === "number" ? input.previousClientsAtStart : null,
    previous: input.previous,
    targets: input.targets,
    benchmarks: input.benchmarks,
    entities: Object.fromEntries(
      input.entities.map((e) => [e.id, { name: e.name, goal: e.campaign_goal }]),
    ),
  };
}
