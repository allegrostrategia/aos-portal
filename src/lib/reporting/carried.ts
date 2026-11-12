import type { Figure } from "./formulas.ts";
import type { ExpenseRow, Received } from "./ledger.ts";

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
  /**
   * WHICH month those are, so the card can still say "vs. July".
   *
   * Found by the before/after screenshots on 7 October: freezing the
   * figures was not enough. `MonthView.previous` is the previous month
   * the VIEWER can see, and a retainer client sees published ones only —
   * so unpublishing July turned every "↑ 14% vs. July" on a published
   * August into "No month to compare", with the frozen figures sitting
   * right there unused.
   */
  previousMonth: string | null;
  /** §7's bar and "is at 40% of your target" — a sentence in the report. */
  targets: Record<ValueKey, number>;
  /** What the traffic lights were drawn against. */
  benchmarks: Record<string, number>;
  /**
   * The workspace-level settings that change a published figure: the row
   * labels, a campaign's goal, which decides whose spend counts towards
   * cost per lead (§10.2 — £4.50 honest against £6.00 blended), and an
   * offer's price.
   *
   * **Price is optional, and `undefined` is not `null`.** Snapshots
   * written before 11 November carry no price at all; those months must
   * go on reading the live one rather than suddenly showing a dash, so
   * absent means "not frozen, use what the offer says now" and null
   * means "frozen, and the offer had no price that day".
   */
  entities: Record<string, { name: string; goal: string | null; price?: number | null }>;
  /**
   * What this month's forecast said about the months after it, month by
   * month.
   *
   * **Frozen rather than read live** (Dom, 12 and 13 November). It is the
   * only forward-looking figure on the report, and the report draws actual
   * against forecast across the year — so live, a published September
   * would move every time somebody revised November's forecast. Reading it
   * live would also mean a client's RLS had to hand them months they have
   * not been shown, which is the same decision from the other side.
   *
   * **Absent is not empty**, the same distinction `entities.price` makes:
   * a snapshot with no key at all must go on reading the live forecast,
   * while `[]` means it was frozen and nothing was forecast.
   */
  forecastAhead?: { month: string; amount: number }[];
  /**
   * What came in the month BEFORE this one, row by row.
   *
   * Financials' revenue is the Actual grid from 13 November, so "£2,150,
   * up from £1,900" is now arithmetic over another month's cells — and
   * another month's cells can still be edited while this one is
   * published, if that month was never published itself. Same rule as
   * `previous`: what comes from another month is frozen.
   *
   * The row's offer link and the cell's recurring setting come with it,
   * because the comparison needs the same three figures this month shows
   * — revenue from offers, other income and MRR.
   *
   * **Absent is not empty**, as everywhere else here.
   */
  previousReceived?: Received[];
  /**
   * What the month BEFORE this one cost, row by row, with each row's own
   * bucket.
   *
   * The four cost totals are the expense grid's buckets from 13
   * November, so "profit £1,100, up from £900" is arithmetic over
   * another month's cells — and that month may still be a draft. Same
   * rule, same absent-is-not-empty.
   */
  previousCosts?: ExpenseRow[];
}

export const EMPTY_CARRIED: Carried = {
  clientsAtStart: null,
  previousClientsAtStart: null,
  previous: {},
  previousMonth: null,
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
  const receipts = (v: unknown): Received[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (row): row is Received =>
          !!row &&
          typeof row === "object" &&
          typeof (row as { salesRowId?: unknown }).salesRowId === "string" &&
          typeof (row as { amount?: unknown }).amount === "number" &&
          ["none", "monthly", "annual"].includes(
            (row as { recurrence?: unknown }).recurrence as string,
          ),
      )
      .map((row) => ({
        salesRowId: row.salesRowId,
        // A snapshot written before the kind mattered reads as a client
        // row, which is the half that is not "revenue from offers" — the
        // safer way round, and the commoner one.
        rowType: row.rowType === "offer" ? ("offer" as const) : ("client" as const),
        offerEntityId: typeof row.offerEntityId === "string" ? row.offerEntityId : null,
        amount: row.amount,
        recurrence: row.recurrence,
      }));
  };
  const spending = (v: unknown): ExpenseRow[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (row): row is ExpenseRow =>
          !!row &&
          typeof row === "object" &&
          typeof (row as { categoryId?: unknown }).categoryId === "string" &&
          typeof (row as { month?: unknown }).month === "string" &&
          typeof (row as { amount?: unknown }).amount === "number" &&
          ["fixed", "variable", "team", "investment"].includes(
            (row as { bucket?: unknown }).bucket as string,
          ),
      )
      .map((row) => ({
        categoryId: row.categoryId,
        bucket: row.bucket,
        month: row.month,
        amount: row.amount,
      }));
  };
  const schedule = (v: unknown): { month: string; amount: number }[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (row): row is { month: string; amount: number } =>
          !!row &&
          typeof row === "object" &&
          typeof (row as { month?: unknown }).month === "string" &&
          typeof (row as { amount?: unknown }).amount === "number",
      )
      .map((row) => ({ month: row.month, amount: row.amount }));
  };

  const entities: Carried["entities"] = {};
  if (raw.entities && typeof raw.entities === "object" && !Array.isArray(raw.entities)) {
    for (const [id, row] of Object.entries(raw.entities as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.name !== "string") continue;
      const frozen: Carried["entities"][string] = {
        name: r.name,
        goal: typeof r.goal === "string" ? r.goal : null,
      };
      // Only carried forward when the snapshot actually has the key: see
      // the note on `entities` about absent against null.
      if ("price" in r && (typeof r.price === "number" || r.price === null)) {
        frozen.price = r.price;
      }
      entities[id] = frozen;
    }
  }

  return {
    clientsAtStart: figure(raw.clientsAtStart),
    previousClientsAtStart: figure(raw.previousClientsAtStart),
    previous: nullableNumbers(raw.previous),
    previousMonth: typeof raw.previousMonth === "string" ? raw.previousMonth : null,
    targets: numbers(raw.targets),
    benchmarks: numbers(raw.benchmarks),
    entities,
    // Only when the key is there: absent means "not frozen, read the
    // live forecast", which is what every month published before
    // 13 November looks like.
    ...("forecastAhead" in raw && schedule(raw.forecastAhead) !== undefined
      ? { forecastAhead: schedule(raw.forecastAhead)! }
      : {}),
    ...("previousReceived" in raw && receipts(raw.previousReceived) !== undefined
      ? { previousReceived: receipts(raw.previousReceived)! }
      : {}),
    ...("previousCosts" in raw && spending(raw.previousCosts) !== undefined
      ? { previousCosts: spending(raw.previousCosts)! }
      : {}),
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
  previousMonth: string | null;
  targets: Record<ValueKey, number>;
  benchmarks: Record<string, number>;
  entities: { id: string; name: string; campaign_goal: string | null; price: number | null }[];
  /** Already summed per month by `forecastAfter`. */
  forecastAhead: { month: string; amount: number }[];
  /** Already flattened by `receivedThisMonth`, for the month before this. */
  previousReceived: Received[];
  /** The month before this one's expense rows, each with its own bucket. */
  previousCosts: ExpenseRow[];
}): Carried {
  return {
    clientsAtStart: typeof input.clientsAtStart === "number" ? input.clientsAtStart : null,
    previousClientsAtStart:
      typeof input.previousClientsAtStart === "number" ? input.previousClientsAtStart : null,
    previous: input.previous,
    previousMonth: input.previousMonth,
    targets: input.targets,
    benchmarks: input.benchmarks,
    entities: Object.fromEntries(
      input.entities.map((e) => [e.id, { name: e.name, goal: e.campaign_goal, price: e.price }]),
    ),
    forecastAhead: input.forecastAhead,
    previousReceived: input.previousReceived,
    previousCosts: input.previousCosts,
  };
}
