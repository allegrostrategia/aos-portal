import { leads, type CallWin, type Figure } from "./formulas.ts";

/**
 * What the month's calls bought — the rows, and what they add up to.
 *
 * Nina, 16 November: "add calls converted and what they bought (by offer,
 * with revenue)". Dom, the same day: "add a Bespoke / other line, with sales
 * and value both typed. Clients on bespoke packages have no offer or price,
 * and Nina's agency-style clients will have many of these."
 *
 * Pure, and in one place, because five screens draw this — the entry grid's
 * running total, the report's bars and table, the PDF's, and the demo seed's
 * sanity check. A bespoke line counted in one total and forgotten in another
 * is the kind of disagreement nobody can explain afterwards.
 */

/** The figure typed against each offer. */
export const CALL_WINS_SALES = "leads_conversions_sales_from_calls";
/** Worked out from it: sales × that offer's price. Never stored. */
export const CALL_WINS_VALUE = "leads_conversions_value_of_sales_from_calls";
/** Work priced per job: no offer, no price, so both are typed. */
export const BESPOKE_SALES = "leads_conversions_bespoke_sales_from_calls";
export const BESPOKE_VALUE = "leads_conversions_value_of_bespoke_sales_from_calls";

/**
 * The four the breakdown owns.
 *
 * Named so the generic month form can leave them out. Two of them hang off
 * an offer and are excluded by that alone; **the two bespoke ones do not**,
 * so without this list they would appear as month-level boxes in the form
 * above the grid — the same figure asked for twice on one screen, with two
 * save buttons and no way to tell which one won.
 */
export const CALL_WINS_METRICS = new Set([
  CALL_WINS_SALES,
  CALL_WINS_VALUE,
  BESPOKE_SALES,
  BESPOKE_VALUE,
]);

/**
 * The bespoke line's id, which is not an entity id because there is no
 * entity. A string nothing else can collide with: entity ids are uuids.
 */
export const BESPOKE_ID = "bespoke";
export const BESPOKE_LABEL = "Bespoke / other";

export interface CallWinRow {
  /** An offer's id, or `BESPOKE_ID`. */
  id: string;
  name: string;
  /** Null on the bespoke line, and on an offer nobody has priced. */
  price: number | null;
  sales: number | null;
  /** Worked out for an offer, typed for bespoke. Null is not £0. */
  value: number | null;
  bespoke: boolean;
}

export interface BespokeWins {
  sales: Figure;
  value: Figure;
}

/**
 * Every line of the breakdown, offers first and bespoke last.
 *
 * **Bespoke sits at the bottom, always**, the way the Offers donut puts
 * "everything else" last: it is not an offer competing with the others and
 * ranking it among them would say it was.
 *
 * A line with nothing against it is left out. A line with a genuine 0 stays,
 * because 0 is an answer (§4).
 */
export function callWinRows(offers: CallWin[], bespoke: BespokeWins): CallWinRow[] {
  const rows: CallWinRow[] = offers
    .filter((offer) => offer.salesFromCalls !== null && offer.salesFromCalls !== undefined)
    .map((offer) => ({
      id: offer.id,
      name: offer.name,
      price: offer.price ?? null,
      sales: offer.salesFromCalls ?? null,
      value: leads.valueOfSales(offer.salesFromCalls, offer.price) ?? null,
      bespoke: false,
    }));

  if (
    (bespoke.sales !== null && bespoke.sales !== undefined) ||
    (bespoke.value !== null && bespoke.value !== undefined)
  ) {
    rows.push({
      id: BESPOKE_ID,
      name: BESPOKE_LABEL,
      price: null,
      sales: bespoke.sales ?? null,
      value: bespoke.value ?? null,
      bespoke: true,
    });
  }

  return rows;
}

/**
 * What the breakdown comes to.
 *
 * `unpriced` counts the lines that sold something and cannot say what it was
 * worth — an offer with no price set. It is reported rather than hidden,
 * because a total that looks low is a question, and the answer belongs on
 * the same screen. **The bespoke line is never unpriced**: its value is
 * typed, so a blank one means nobody has filled it in yet, which the empty
 * box already says.
 */
export function callWinTotals(rows: CallWinRow[]): {
  sales: number;
  value: number;
  unpriced: number;
} {
  return {
    sales: rows.reduce((t, r) => t + (r.sales ?? 0), 0),
    value: rows.reduce((t, r) => t + (r.value ?? 0), 0),
    unpriced: rows.filter((r) => !r.bespoke && r.sales !== null && r.price === null).length,
  };
}
