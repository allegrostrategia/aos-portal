import { cellNumber, readTable } from "./tokenise.ts";
import type { ImportResult } from "./meta-content.ts";
import { coversMonth, rangeFromRows } from "./month-range.ts";

/**
 * §10.2: the Meta Ads Manager campaign export, one row per campaign.
 *
 * Fills Ads. Four of §10.2's rules live here, and each one is a way the
 * obvious implementation would be wrong.
 */

/** A column the client has not yet said what to do with. */
export interface UnknownConversion {
  column: string;
  /** What it adds up to across the campaigns that spent, for context. */
  total: number;
}

/**
 * One campaign's figures, from one row of the export.
 *
 * §10.2's file is one row per campaign and the Ads entry screen stores
 * per campaign too (`ads_spend|<campaign id>`), so the account totals
 * above are for the report, not for filling boxes. These are what fills
 * them.
 */
export interface CampaignFigures {
  /** Exactly as the file spells it, trimmed. Matching is exact. */
  name: string;
  figures: Record<string, number>;
  /** Whether `Result indicator` says this campaign was after leads. */
  goalIsLeads: boolean;
}

export interface AdsImportResult extends ImportResult {
  /** One per campaign that spent, in the file's order. */
  campaigns: CampaignFigures[];
  /** §10.2's custom conversions, for the client to tick. */
  unknownConversions: UnknownConversion[];
  /** Spend on campaigns whose goal is leads, which cost per lead uses. */
  leadCampaignSpend: number;
}

/** Columns that are never a custom conversion, whatever they are called. */
const KNOWN = new Set([
  "campaign name", "campaign delivery", "impressions", "reach", "link clicks",
  "leads", "purchases", "purchase conversion value", "instagram profile visits",
  "results", "result indicator", "cost per result", "frequency", "cpm", "ctr",
  "reporting starts", "reporting ends", "ad set name", "ad name", "objective",
]);

/** `Result indicator` values that mean this campaign was after leads. */
const LEAD_INDICATORS = ["lead", "onsite_conversion", "offsite_conversion", "complete_registration"];

export function readMetaAds(
  text: string,
  /** The month on screen, so a file for another one is refused. */
  month: string,
  /** The client's saved choices: column name to what it counts as. */
  columnMaps: Record<string, "leads" | "purchases" | "ignored"> = {},
): AdsImportResult {
  const { headers, rows } = readTable(text);
  if (rows.length === 0) {
    return {
      figures: {}, cannotFill: [], rowsUsed: 0, rowsOutsideMonth: 0,
      unknownConversions: [], leadCampaignSpend: 0, campaigns: [],
      problem: "That file has no rows in it.",
    };
  }

  // **Matched by its start, not its whole name** (§10.2): the currency
  // in the brackets changes per client, so "Amount spent (GBP)" and
  // "Amount spent (USD)" are the same column.
  const spendColumn = headers
    .map((h) => h.toLowerCase())
    .find((h) => h.startsWith("amount spent"));

  if (!spendColumn) {
    return {
      figures: {}, cannotFill: [], rowsUsed: 0, rowsOutsideMonth: 0,
      unknownConversions: [], leadCampaignSpend: 0, campaigns: [],
      problem:
        // Naming the screen it belongs on, not just refusing: the two
        // exports are a click apart in Meta and the obvious mistake is
        // bringing the right file to the wrong card (Dom, 9 Oct).
        "That looks like a Meta content export, not an ads one. Post figures go on the Social Media screen.",
    };
  }

  // **The file says what range it covers, so a file for another month
  // is refused rather than quietly added to this one** (Dom, 9 Oct).
  const range = rangeFromRows(rows);
  const covers = coversMonth(range.start, range.end, month);
  if (!covers.ok) {
    return {
      figures: {}, cannotFill: [], rowsUsed: 0, rowsOutsideMonth: 0,
      unknownConversions: [], leadCampaignSpend: 0, campaigns: [],
      problem: covers.reason,
    };
  }

  // **Campaigns that spent nothing are skipped** (§10.2) — four of the
  // nine in the sample were inactive rows of zeros, and counting them
  // would not change a total but would make "9 campaigns" a lie.
  const spent = rows.filter((row) => (cellNumber(row[spendColumn]) ?? 0) > 0);

  const sum = (column: string, from = spent) =>
    from.reduce((total, row) => total + (cellNumber(row[column]) ?? 0), 0);

  // Any column that is not a known one and is not a date or a name is a
  // candidate custom conversion. Those the client has already mapped are
  // counted; the rest are handed back for them to tick.
  const candidates = headers
    .map((h) => h.toLowerCase())
    .filter((h) => !KNOWN.has(h) && h !== spendColumn && spent.some((r) => cellNumber(r[h]) !== null));

  const mappedAs = (what: "leads" | "purchases") =>
    candidates.filter((column) => columnMaps[column] === what);

  const unknownConversions = candidates
    .filter((column) => columnMaps[column] === undefined)
    .map((column) => ({ column, total: sum(column) }));

  // **A campaign is a lead campaign by its Result indicator**, not by
  // the Results column — which means something different in every row
  // and must never be summed (§10.2).
  const leadCampaigns = spent.filter((row) => {
    const indicator = (row["result indicator"] ?? "").toLowerCase();
    return LEAD_INDICATORS.some((hint) => indicator.includes(hint));
  });


  const leadsFromColumns = sum("leads") + mappedAs("leads").reduce((t, c) => t + sum(c), 0);

  const perCampaign = (row: Record<string, string>) => {
    const at = (column: string) => cellNumber(row[column]);
    const figures: Record<string, number> = {};
    const put = (key: string, value: number | null) => {
      // §4's rule per row as well: a column the file does not have is
      // not a zero for every campaign in it.
      if (value !== null) figures[key] = value;
    };
    put("ads_spend", at(spendColumn));
    put("ads_impressions", at("impressions"));
    put("ads_link_clicks", at("link clicks"));
    put(
      "ads_leads",
      [at("leads"), ...mappedAs("leads").map((c) => at(c))]
        .reduce<number | null>((total, v) => (v === null ? total : (total ?? 0) + v), null),
    );
    put(
      "ads_purchases",
      [at("purchases"), ...mappedAs("purchases").map((c) => at(c))]
        .reduce<number | null>((total, v) => (v === null ? total : (total ?? 0) + v), null),
    );
    put("ads_revenue_from_ads", at("purchase conversion value"));
    return figures;
  };

  const isLeadGoal = (row: Record<string, string>) => {
    const indicator = (row["result indicator"] ?? "").toLowerCase();
    return LEAD_INDICATORS.some((hint) => indicator.includes(hint));
  };

  return {
    campaigns: spent.map((row) => ({
      name: (row["campaign name"] ?? "").trim(),
      figures: perCampaign(row),
      goalIsLeads: isLeadGoal(row),
    })),
    figures: {
      ads_spend: sum(spendColumn),
      ads_impressions: sum("impressions"),
      ads_link_clicks: sum("link clicks"),
      ads_leads: leadsFromColumns,
      ads_purchases: sum("purchases") + mappedAs("purchases").reduce((t, c) => t + sum(c), 0),
      ads_revenue_from_ads: sum("purchase conversion value"),
      ads_profile_visits_from_ads: sum("instagram profile visits"),
    },
    cannotFill: [
      // **Reach is never summed across campaigns** (§10.2), the same
      // overlap problem as posts: one person reached by three campaigns
      // is one person.
      "Reach — campaigns overlap, so type it from the export's summary row",
    ],
    rowsUsed: spent.length,
    // Not a month filter here: the export is already a date range, and
    // §10.2's file has no per-row date. Rows skipped are the zero ones.
    rowsOutsideMonth: rows.length - spent.length,
    unknownConversions,
    // **Cost per lead uses lead campaigns' spend only** (§10.2). In the
    // sample, blending the £150 of profile-visit spend turns £4.50 into
    // £6.00.
    leadCampaignSpend: leadCampaigns.reduce(
      (total, row) => total + (cellNumber(row[spendColumn]) ?? 0),
      0,
    ),
  };
}
