/**
 * Financials as a ledger: sales, cash, and what it cost to deliver.
 *
 * Nina, 11 November, with her own 2025 tracker as the layout reference.
 * Every figure here is typed by somebody — nothing is imported, and §10's
 * manual-entry rule is untouched.
 *
 * **Sales and cash are different questions and this file keeps them
 * apart.** Until now Financials had one revenue figure and nobody had to
 * say which of the two it was.
 *
 * A SALE is what was sold, counted in the month it was sold — all of it,
 * whatever the payment plan. CASH is what arrived, counted in the month
 * it arrived. So £2,000 sold in September as four £500s reads:
 *
 *     September   Sales £2,000   Cash £500
 *     October     Sales     —    Cash £500
 *     November    Sales     —    Cash £500
 *     December    Sales     —    Cash £500
 *
 * A dash rather than £0 in October, because nothing being sold is not
 * the same as selling nothing. (Dom, 11 November: the first draft summed
 * sales on the instalment month, which was cash wearing the word
 * "sales".)
 *
 * Relative imports, no database: `node --test "src/**\/*.test.ts"`
 * cannot resolve the `@/` alias, and arithmetic this load-bearing should
 * be testable without a Supabase client.
 */

import { divide, percentage, sum, type Figure, type Result } from "./formulas.ts";

export type ExpenseBucket = "fixed" | "variable" | "team" | "investment";
export type SalesRowType = "offer" | "client";

export interface SalesRow {
  id: string;
  name: string;
  rowType: SalesRowType;
  /** Set only on an offer row, and only when they have linked it. */
  offerEntityId: string | null;
  active: boolean;
}

/** How a sale is billed, which is where MRR comes from. */
export type Billing = "one_off" | "monthly" | "annual";

export interface Sale {
  id: string;
  salesRowId: string;
  /** The month it was SOLD in. The whole value counts here. */
  month: string;
  totalValue: number;
  /**
   * **Instalments are not recurrence.** A £2,000 course paid in four
   * £500s is `one_off`: one is a way of paying, the other is a way of
   * being sold again next month. Retainers are `monthly` and that is
   * what fixes MRR — it used to mean "revenue on offers marked
   * recurring", which dropped every retainer on the floor, and
   * retainers are the recurring revenue for an agency like Nina's.
   */
  billing: Billing;
  /** Set when the sale fell through. Marked, never deleted (rule 7). */
  cancelledOn: string | null;
}

export interface SalePayment {
  saleId: string;
  /** The month it was expected. */
  dueMonth: string;
  /** The month the money arrived, or null while it has not. Cash counts here. */
  receivedMonth: string | null;
  amount: number;
  /** Set when this instalment was cancelled. It stops counting and stays. */
  cancelledOn: string | null;
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

const inMonth = (value: string | null, month: string) => value === month;

/** A cancelled sale, and a cancelled instalment, stop counting. */
const live = <T extends { cancelledOn: string | null }>(rows: T[]) =>
  rows.filter((row) => row.cancelledOn === null);

/** What the client sold this month, whatever has been paid of it. */
export function salesIn(sales: Sale[], month: string): Result {
  const mine = live(sales).filter((s) => s.month === month);
  return mine.length === 0 ? null : sum(...mine.map((s) => s.totalValue));
}

/** What arrived in the bank this month, whenever it was sold. */
export function cashIn(payments: SalePayment[], month: string): Result {
  const mine = live(payments).filter((p) => inMonth(p.receivedMonth, month));
  return mine.length === 0 ? null : sum(...mine.map((p) => p.amount));
}

/**
 * Her Recurring Revenue tab, in three lines: the monthly payments, the
 * annual ones, and the two together.
 *
 * On the due month rather than the received month, because the question
 * it answers is what the business is owed each month by the people who
 * have already agreed to pay it.
 */
export function recurringSplit(
  sales: Sale[],
  payments: SalePayment[],
  month: string,
): { monthly: Result; annual: Result; combined: Result } {
  const billingOf = new Map(live(sales).map((s) => [s.id, s.billing]));
  const mine = live(payments)
    .filter((p) => inMonth(p.dueMonth, month))
    .map((p) => ({ amount: p.amount, billing: billingOf.get(p.saleId) }))
    .filter((p) => p.billing !== undefined && p.billing !== "one_off");

  const monthly = mine.filter((p) => p.billing === "monthly");
  const annual = mine.filter((p) => p.billing === "annual");
  return {
    monthly: monthly.length === 0 ? null : sum(...monthly.map((p) => p.amount)),
    annual: annual.length === 0 ? null : sum(...annual.map((p) => p.amount)),
    combined: mine.length === 0 ? null : sum(...mine.map((p) => p.amount)),
  };
}

/**
 * Money due by the end of this month that has not arrived.
 *
 * Counted as of a month rather than as of today, so a published report
 * says what was outstanding then — not what is outstanding now, which
 * would change a client's September every time somebody paid in March.
 */
export function outstandingBy(payments: SalePayment[], month: string): Result {
  const late = live(payments).filter(
    (p) => p.dueMonth <= month && (p.receivedMonth === null || p.receivedMonth > month),
  );
  return late.length === 0 ? null : sum(...late.map((p) => p.amount));
}

/** What is already scheduled into the months after this one, month by month. */
export function scheduledAfter(
  payments: SalePayment[],
  month: string,
): { month: string; amount: number }[] {
  const ahead = new Map<string, number>();
  for (const p of live(payments)) {
    if (p.dueMonth <= month) continue;
    ahead.set(p.dueMonth, (ahead.get(p.dueMonth) ?? 0) + p.amount);
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
    const mine = expenses.filter((e) => e.month === month && e.bucket === bucket);
    out[bucket] = mine.length === 0 ? null : sum(...mine.map((e) => e.amount));
  }
  return out;
}

/**
 * This month's revenue per linked offer, so the Offers donut, the margin
 * and the hourly rate go on reading the figure they always have.
 *
 * **On the month it was sold**, which is the same choice the Overview
 * makes: every other figure on the report is about the month's activity
 * rather than the month's bank.
 */
export function offerRevenue(
  rows: SalesRow[],
  sales: Sale[],
  month: string,
): Map<string, number> {
  const offerOf = new Map(
    rows.filter((r) => r.offerEntityId !== null).map((r) => [r.id, r.offerEntityId!]),
  );
  const out = new Map<string, number>();
  for (const sale of live(sales)) {
    if (sale.month !== month) continue;
    const offer = offerOf.get(sale.salesRowId);
    if (!offer) continue;
    out.set(offer, (out.get(offer) ?? 0) + sale.totalValue);
  }
  return out;
}

/**
 * Everything sold this month that is NOT linked to an offer.
 *
 * **One slice, not forty.** The Offers donut has to total the same as
 * revenue or the two screens disagree (§9), and a business like Nina's
 * agency has dozens of bespoke clients — a slice each would turn a chart
 * about offers into a client list nobody can read. So the bespoke work
 * is one slice with its count beside it, and who is in it is the
 * per-client card's job.
 */
export function bespokeRevenue(
  rows: SalesRow[],
  sales: Sale[],
  month: string,
): { total: Result; clients: number } {
  const linked = new Set(rows.filter((r) => r.offerEntityId !== null).map((r) => r.id));
  const mine = live(sales).filter((s) => s.month === month && !linked.has(s.salesRowId));
  return {
    total: mine.length === 0 ? null : sum(...mine.map((s) => s.totalValue)),
    clients: new Set(mine.map((s) => s.salesRowId)).size,
  };
}

export interface ClientProfit {
  salesRowId: string;
  name: string;
  /** What they paid this month — cash, because profitability is about money in. */
  paid: Result;
  hours: Result;
  staffCost: Result;
  profit: Result;
  margin: Result;
}

/**
 * Her Client Profitability tab: time spent × rate against what that
 * client paid.
 *
 * **Only what they paid is cash here**, and deliberately: a client who
 * has not paid yet has not made anybody any money, however many hours
 * went into them. That is the figure the tab is for — it is the one
 * that tells you which retainer is quietly costing you.
 *
 * Only client rows. An offer's hours are already asked for on the Offers
 * screen, and asking twice is how two answers to one question get
 * stored.
 */
export function clientProfitability(
  rows: SalesRow[],
  sales: Sale[],
  payments: SalePayment[],
  hours: ClientHours[],
  month: string,
): ClientProfit[] {
  const rowOf = new Map(live(sales).map((s) => [s.id, s.salesRowId]));
  return rows
    .filter((row) => row.rowType === "client")
    .map((row) => {
      const paidRows = live(payments).filter(
        (p) => rowOf.get(p.saleId) === row.id && inMonth(p.receivedMonth, month),
      );
      const mine = hours.filter((h) => h.salesRowId === row.id && h.month === month);

      const paid: Result = paidRows.length === 0 ? null : sum(...paidRows.map((p) => p.amount));
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
 * Local rather than imported: `formulas.difference` treats a missing
 * figure as unknown, and a client who paid with nobody's hours against
 * them has a real profit — all of it.
 */
function difference(paid: Result, cost: Result): Result {
  if (paid === null && cost === null) return null;
  return (paid ?? 0) - (cost ?? 0);
}
