/**
 * Financials as two grids: money received, and money expected.
 *
 * Nina, 13 November, reviewing the first ledger. That one modelled a sale
 * as a record with a payment plan hanging off it — a month sold, a total
 * value, instalments with a due month and a received month — which is how
 * an accounting system works and is not how she works. **What she does
 * each month is open the bank account and Stripe and type in what
 * landed.**
 *
 * So there is no sale, no schedule, no due date and no cancellation:
 *
 *   · **Actual** is money received. A row name and an amount, per month.
 *   · **Forecast** is money expected, on the same grid, typed or pasted
 *     across however many months it lasts. Nothing is generated —
 *     retainers are here because somebody put them here.
 *
 * Every figure is typed by a person. §10's manual-entry rule is untouched,
 * and the reason it exists — payment exports carry card details — is
 * exactly why a page somebody types into is the right answer.
 *
 * Relative imports, no database: `node --test "src/**\/*.test.ts"` cannot
 * resolve the `@/` alias, and arithmetic this load-bearing should be
 * testable without a Supabase client.
 */

import { divide, percentage, sum, type Figure, type Result } from "./formulas.ts";

export type ExpenseBucket = "fixed" | "variable" | "team" | "investment";
export type SalesRowType = "offer" | "client";

/**
 * Whether money on a row recurs, and how often.
 *
 * Three values rather than a tick, because her Recurring Revenue tab has
 * three lines: the monthly ones, the annual ones, and the two together.
 */
export type Recurrence = "none" | "monthly" | "annual";

export interface SalesRow {
  id: string;
  name: string;
  rowType: SalesRowType;
  /** Set only on an offer row, and only when they have linked it. */
  offerEntityId: string | null;
  active: boolean;
  /** The DEFAULT for new cells of the Actual grid, not a fact about them. */
  recurrence: Recurrence;
}

/** One cell of the Forecast grid. */
export interface Cell {
  salesRowId: string;
  month: string;
  amount: number;
}

/**
 * One cell of the Actual grid, which carries its own recurrence.
 *
 * Dom, 13 November. On the row alone, unticking "recurring" would rewrite
 * MRR on a month a client had already read; locked to the row, a client
 * who paid one-off in January and went onto a retainer in April could not
 * be recorded without unpublishing January. Per cell, both just work —
 * January keeps `none` and April is `monthly`, on the same row.
 */
export interface ActualCell extends Cell {
  recurrence: Recurrence;
}

export interface ExpenseRow {
  categoryId: string;
  bucket: ExpenseBucket;
  month: string;
  amount: number;
}

export interface ClientHours {
  salesRowId: string;
  month: string;
  hours: number;
  /** The rate as it was when the hours were saved (§5.5's price-at-month idea). */
  rateUsed: number;
}

const inMonth = <T extends { month: string }>(cells: T[], month: string) =>
  cells.filter((c) => c.month === month);

/**
 * Missing is a dash, not a zero.
 *
 * A month nobody has typed into is not a month that earned nothing, and
 * the two must not print the same. Kept in one place so every figure on
 * the screen agrees about it.
 */
const total = <T extends { amount: number }>(cells: T[]): Result =>
  cells.length === 0 ? null : sum(...cells.map((c) => c.amount));

/**
 * One row's money received in a month, with everything a figure needs
 * to be worked out from.
 *
 * **The join is done once, here.** Whether money is "from an offer"
 * belongs to the row; whether it recurs belongs to the cell, captured as
 * it was written. Two callers need both — the server, for the report and
 * the published freeze, and the browser, for the card that updates as you
 * type — and §9's rule is that two implementations of one piece of
 * arithmetic will disagree sooner or later.
 */
export interface Received {
  salesRowId: string;
  /** What the row is: the split Revenue from offers and Other income make. */
  rowType: SalesRowType;
  /** The offer this row is linked to, for the Offers donut. Often null. */
  offerEntityId: string | null;
  amount: number;
  recurrence: Recurrence;
}

/** This month's received money, flattened against the rows it came in on. */
export function receivedThisMonth(
  // Only the three things a figure is worked out from, so the
  // publish-time freeze can pass what it reads rather than inventing a
  // whole row.
  rows: Pick<SalesRow, "id" | "rowType" | "offerEntityId">[],
  actuals: ActualCell[],
  month: string,
): Received[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return inMonth(actuals, month)
    // A cell whose row has gone is not a figure anybody can explain, and
    // rows are never removed (rule 7), so this only ever drops a cell
    // written against a row from another workspace.
    .filter((c) => byId.has(c.salesRowId))
    .map((c) => ({
      salesRowId: c.salesRowId,
      rowType: byId.get(c.salesRowId)!.rowType,
      offerEntityId: byId.get(c.salesRowId)!.offerEntityId,
      amount: c.amount,
      recurrence: c.recurrence,
    }));
}

/**
 * What came in on offer rows — Revenue from offers.
 *
 * **The row's kind, not its offer link.** A row is one offer or one
 * customer, and linking it to the Offers screen is optional — plenty of
 * clients never do it. Splitting on the link read "Other income £2,150"
 * on a month whose money was a programme, which is the label saying
 * something untrue. The link is still what the Offers donut is drawn
 * from, which is a chart about offer entities rather than about a month.
 */
export function fromOffers(received: Received[]): Result {
  return total(received.filter((c) => c.rowType === "offer"));
}

/**
 * What came in on client rows — Other income.
 *
 * Retainers and bespoke work, which is most of the money in an agency
 * like Nina's. It is the other half of Revenue from offers, so the two
 * add up to the month and nothing received is left out of the report.
 */
export function notFromOffers(received: Received[]): Result {
  return total(received.filter((c) => c.rowType !== "offer"));
}

/**
 * The recurring part of what came in — her MRR line.
 *
 * **Money received, not money expected**, and read off each cell's own
 * copy of the setting rather than the row's: a client who paid one-off in
 * January and went onto a retainer in April is one row that is both.
 */
export function recurringTotal(received: { amount: number; recurrence: Recurrence }[]): Result {
  return total(received.filter((c) => c.recurrence !== "none"));
}

/** What actually landed this month. The headline figure on Overview. */
export function receivedIn(actuals: ActualCell[], month: string): Result {
  return total(inMonth(actuals, month));
}

/** What they expect this month — the figure that sits beside it. */
export function forecastIn(forecasts: Cell[], month: string): Result {
  return total(inMonth(forecasts, month));
}

/**
 * Her Recurring Revenue tab, in three lines: the monthly ones, the annual
 * ones, and the two together.
 *
 * **Money received, not money expected.** MRR used to mean "revenue on
 * offers marked recurring", which dropped every retainer on the floor; it
 * then briefly meant instalments due on a sale billed monthly, which
 * counted money nobody had sent. This is what arrived, on the cells that
 * recur.
 */
export function recurringSplit(
  actuals: ActualCell[],
  month: string,
): { monthly: Result; annual: Result; combined: Result } {
  const mine = inMonth(actuals, month);
  return {
    monthly: total(mine.filter((c) => c.recurrence === "monthly")),
    annual: total(mine.filter((c) => c.recurrence === "annual")),
    // The same function the report's MRR goes through, so the strip on
    // the entry screen and the figure in the report are one number.
    combined: recurringTotal(mine),
  };
}

/**
 * What is forecast for the months after this one, month by month.
 *
 * **Frozen into the carried snapshot at publish** as `forecastAhead` (Dom,
 * 12 and 13 November). The report draws actual against forecast across the
 * year, so a published month would otherwise move every time somebody
 * revised a later forecast — and answering it from live rows would mean a
 * client's RLS had to let them read months they have not been shown.
 */
export function forecastAfter(
  forecasts: Cell[],
  month: string,
): { month: string; amount: number }[] {
  const ahead = new Map<string, number>();
  for (const cell of forecasts) {
    if (cell.month <= month) continue;
    ahead.set(cell.month, (ahead.get(cell.month) ?? 0) + cell.amount);
  }
  return [...ahead.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, amount]) => ({ month: m, amount }));
}

/** Each bucket's total for the month, for the four cost figures. */
export function costsByBucket(
  expenses: ExpenseRow[],
  month: string,
): Record<ExpenseBucket, Result> {
  const out: Record<ExpenseBucket, Result> = {
    fixed: null,
    variable: null,
    team: null,
    investment: null,
  };
  for (const bucket of Object.keys(out) as ExpenseBucket[]) {
    out[bucket] = total(inMonth(expenses, month).filter((e) => e.bucket === bucket));
  }
  return out;
}

/**
 * This month's money per linked offer, so the Offers donut, the margin and
 * the hourly rate go on reading the figure they always have.
 */
export function offerRevenue(
  rows: SalesRow[],
  actuals: ActualCell[],
  month: string,
): Map<string, number> {
  const offerOf = new Map(
    rows.filter((r) => r.offerEntityId !== null).map((r) => [r.id, r.offerEntityId!]),
  );
  const out = new Map<string, number>();
  for (const cell of inMonth(actuals, month)) {
    const offer = offerOf.get(cell.salesRowId);
    if (!offer) continue;
    out.set(offer, (out.get(offer) ?? 0) + cell.amount);
  }
  return out;
}

/**
 * Everything received this month that is NOT linked to an offer.
 *
 * **One slice, not forty.** The Offers donut has to total the same as
 * revenue or the two screens disagree (§9), and a business like Nina's
 * agency has dozens of bespoke clients — a slice each would turn a chart
 * about offers into a client list nobody can read. So the bespoke work is
 * one slice with its count beside it, and who is in it is the per-client
 * card's job.
 */
export function bespokeRevenue(
  rows: SalesRow[],
  actuals: ActualCell[],
  month: string,
): { total: Result; clients: number } {
  const linked = new Set(rows.filter((r) => r.offerEntityId !== null).map((r) => r.id));
  const mine = inMonth(actuals, month).filter((c) => !linked.has(c.salesRowId));
  return {
    total: total(mine),
    clients: new Set(mine.map((c) => c.salesRowId)).size,
  };
}

export interface ClientProfit {
  salesRowId: string;
  name: string;
  /** What they paid this month — the Actual cell, which is money in. */
  paid: Result;
  hours: Result;
  staffCost: Result;
  profit: Result;
  margin: Result;
}

/**
 * Her Client Profitability tab: time spent × rate against what that client
 * paid.
 *
 * Only client rows. An offer's hours are already asked for on the Offers
 * screen, and asking twice is how two answers to one question get stored.
 */
export function clientProfitability(
  rows: SalesRow[],
  actuals: ActualCell[],
  hours: ClientHours[],
  month: string,
): ClientProfit[] {
  return rows
    .filter((row) => row.rowType === "client")
    .map((row) => {
      const paid = total(inMonth(actuals, month).filter((c) => c.salesRowId === row.id));
      const mine = inMonth(hours, month).filter((h) => h.salesRowId === row.id);
      const worked: Result = mine.length === 0 ? null : sum(...mine.map((h) => h.hours));
      const cost: Result =
        mine.length === 0 ? null : sum(...mine.map((h) => h.hours * h.rateUsed));

      return {
        salesRowId: row.id,
        name: row.name,
        paid,
        hours: worked,
        staffCost: cost,
        profit: difference(paid, cost),
        margin: percentage(difference(paid, cost), paid),
      };
    })
    // A client with neither money nor hours this month is not on this
    // month's card: they are a row that was quiet, not a profit of zero.
    .filter((row) => row.paid !== null || row.hours !== null)
    .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
}

/** What an hour of this client's work earned. */
export function effectiveRate(paid: Figure, hours: Figure): Result {
  return divide(paid, hours);
}

/**
 * Which rows to draw in a year's grid.
 *
 * **Retiring a row is gone** (Nina, 13 November: keep the screen to
 * entering numbers), so something else has to stop an agency's three years
 * of former clients filling it. A row is shown when it has a figure in
 * this year, in either grid, and "Show all rows" is one click away.
 *
 * **A row with no figures at all is always shown**, and that is the part
 * worth saying out loud: it is a row somebody has just added and is about
 * to type into, not a client who left. Hiding it the instant it appeared
 * would read as the add having failed.
 *
 * **Either grid, not each.** The two have to line up, or a client would be
 * in one and missing from the other.
 */
export function rowsWithFigures(
  rows: SalesRow[],
  actuals: Cell[],
  forecasts: Cell[],
  year: string,
): SalesRow[] {
  const thisYear = new Set<string>();
  const everUsed = new Set<string>();
  for (const cell of [...actuals, ...forecasts]) {
    everUsed.add(cell.salesRowId);
    if (cell.month.slice(0, 4) === year) thisYear.add(cell.salesRowId);
  }
  return rows.filter((row) => thisYear.has(row.id) || !everUsed.has(row.id));
}

/**
 * Which months to draw, before "Show the whole year".
 *
 * Dom, 12 November, on the phone: twelve columns is a lot of scrolling
 * past nothing. So: every month that has a figure, the month being
 * entered, and three after the last of those to type into — which is the
 * useful part of the year and never hides something already entered.
 */
export function monthsToShow(
  year: string[],
  cells: Cell[],
  month: string,
): string[] {
  const filled = new Set(cells.map((c) => c.month));
  const last = year.reduce(
    (best, m, i) => (filled.has(m) || m === month ? i : best),
    year.indexOf(month),
  );
  return year.filter((m, i) => filled.has(m) || m === month || (i > last && i <= last + 3));
}

/**
 * Local rather than imported: `formulas.difference` treats a missing
 * figure as unknown, and a client who paid with nobody's hours against
 * them has a real profit — all of it.
 */
function difference(paid: Result, cost: Result): Result {
  if (paid === null && cost === null) return null;
  return (paid ?? 0) - (cost ?? 0);
}
