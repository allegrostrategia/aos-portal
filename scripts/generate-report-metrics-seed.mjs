/**
 * Generates the report_metrics seed migration from the brief's own tables.
 *
 *   node scripts/generate-report-metrics-seed.mjs          # rewrite the migration
 *   node scripts/generate-report-metrics-seed.mjs --check  # fail if it is stale
 *   node scripts/generate-report-metrics-seed.mjs --print  # show the table
 *
 * Why generate rather than type it out: there are ninety-odd fields across
 * section 5, and a hand-transcribed list is exactly the kind of thing where a
 * wrong unit or a flipped "Good" direction hides for months and then shows a
 * client a red arrow on a good month. Parsing the spec means the spec is the
 * source, and `--check` in the schema test means the migration cannot drift
 * away from it by hand-editing.
 *
 * Section 6's launch fields are not in the same tabular form (6.3 and 6.5 are
 * prose), so they are listed explicitly in LAUNCH_METRICS below. Section 9
 * says the metric list is "seeded from section 5"; the launch keys are here
 * too so report_launch_values can carry a real foreign key into one namespace
 * rather than accepting any string.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRIEF = path.join(ROOT, "docs/reporting/reporting-tool-brief.md");
const OUT = path.join(ROOT, "supabase/migrations/20260930123000_report_metrics_seed.sql");

/** Brief heading → category enum value. 5.1 Overview has no inputs of its own. */
const SECTIONS = {
  "5.2": "social_media",
  "5.3": "trial_reels",
  "5.4": "email",
  "5.5": "funnels",
  "5.6": "leads_conversions",
  "5.7": "ads",
  "5.8": "client_experience",
  "5.9": "offers",
  "5.10": "financials",
};

/**
 * Which repeatable thing a category's figures MAY be broken down by.
 *
 * "May", not "must": section 5.7's campaign breakdown is "the same core fields
 * per named campaign" alongside the account-level totals, so the same metric
 * key carries both a null entity (the account) and one row per campaign. A
 * value with no entity is always allowed; one with an entity must match this.
 */
const ENTITY_TYPE = {
  // 5.2's heading: "Instagram first; TikTok and LinkedIn added later using the
  // same structure", and the approved mockup has a platform picker.
  social_media: "social_platform",
  funnels: "funnel",
  ads: "ad_campaign",
  offers: "offer",
};

/**
 * Rows in the spec's tables that are not numeric metrics.
 *
 * The two Trial Reels lists are text plus a view count per item, which is what
 * report_top_items exists for — a numeric metric row for them would be a
 * column that could never hold the thing.
 */
const NOT_METRICS = new Set(["trial_reels_top_3_hooks", "trial_reels_top_3_b_roll"]);

/** Keys whose slug is unreadable or ambiguous, fixed by hand. */
const KEY_OVERRIDES = {
  trial_reels_follows_per_1_000_views: "trial_reels_follows_per_1k_views",
  social_media_likes_comments: "social_media_likes_plus_comments",
  client_experience_issues_per_10_clients: "client_experience_issues_per_10_clients",
  // "Costs as % of revenue" — slugifying strips the % and leaves "as_of",
  // which reads as a date.
  financials_costs_as_of_revenue: "financials_costs_as_percent_of_revenue",
};

/**
 * Units the label cannot be trusted to imply.
 *
 * Everything else falls to inferUnit() below. Anything it cannot decide is a
 * hard error rather than a guess, because a metric silently typed as a count
 * when it is money formats £24,850 as 24850.
 */
const UNIT_OVERRIDES = {
  // "Net follower growth" is "followers now − followers last month": a number
  // of people, not a rate. The percentage version is the row below it.
  social_media_net_follower_growth: "count",
  // Same shape: "list size now − list size last month".
  email_net_list_growth: "count",
  // "Profit margin" trips the currency words before the percent ones.
  financials_profit_margin: "percent",
  social_media_engagement_rate: "percent",
  social_media_save_rate: "percent",
  social_media_share_rate: "percent",
  social_media_follower_growth: "percent",
  social_media_profile_visit_to_follow: "percent",
  social_media_non_follower_reach: "percent",
  trial_reels_follows_per_1k_views: "ratio",
  trial_reels_followers_per_hour: "ratio",
  trial_reels_hours_per_buyer: "hours",
  trial_reels_average_views_per_reel: "count",
  email_average_open_rate: "percent",
  email_average_click_rate: "percent",
  email_click_to_open_rate: "percent",
  email_revenue_per_subscriber: "currency",
  funnels_funnel_revenue: "currency",
  funnels_revenue_per_visitor: "currency",
  funnels_sales_page_conversion: "percent",
  funnels_checkout_completion: "percent",
  funnels_overall_conversion: "percent",
  leads_conversions_lead_source_split: "percent",
  ads_cpm: "currency",
  ads_cpc: "currency",
  ads_ctr: "percent",
  ads_cost_per_lead: "currency",
  ads_cost_per_acquisition: "currency",
  ads_roas: "ratio",
  ads_spend: "currency",
  ads_revenue_from_ads: "currency",
  client_experience_issues_per_10_clients: "ratio",
  client_experience_average_client_lifetime: "months",
  offers_units_sold: "count",
  offers_revenue_this_month: "currency",
  offers_other_direct_costs: "currency",
  offers_delivery_cost: "currency",
  offers_effective_hourly_rate: "currency",
  offers_conversion_by_offer: "percent",
  offers_share_of_total_revenue: "percent",
  financials_runway: "months",
  financials_costs_as_percent_of_revenue: "percent",
};

/**
 * Section 5 fields defined in prose rather than in a table, and section 5.9's
 * summary-card table, which has a different header shape.
 *
 * Each is quoted from the brief so the reason it exists is checkable.
 */
const PROSE_METRICS = [
  // 5.2: "Also in Social Media (from Meta's account overview)".
  { category: "social_media", label: "Reach from followers", type: "optional", unit: "count", good: "up" },
  { category: "social_media", label: "Reach from non-followers", type: "optional", unit: "count", good: "up" },
  {
    category: "social_media",
    label: "Non-follower reach %",
    type: "calc",
    unit: "percent",
    good: "up",
    formula: "Reach from non-followers ÷ (reach from followers + reach from non-followers)",
    key: "social_media_non_follower_reach",
  },
  // 5.5: "Also included as optional fields: Order bumps taken and Upsells taken."
  { category: "funnels", label: "Order bumps taken", type: "optional", unit: "count", good: "up" },
  { category: "funnels", label: "Upsells taken", type: "optional", unit: "count", good: "up" },
  {
    category: "funnels", label: "Order bump take rate", type: "calc", unit: "percent", good: "up",
    formula: "Order bumps ÷ purchases",
  },
  {
    category: "funnels", label: "Upsell take rate", type: "calc", unit: "percent", good: "up",
    formula: "Upsells ÷ purchases",
  },
  // 5.7: "Profile visits from ads | Instagram profile visits | Sum (optional extra field)" (10.2).
  { category: "ads", label: "Profile visits from ads", type: "optional", unit: "count", good: "up" },
  // 5.9's "Offers page summary cards" table — workspace-level totals across
  // every offer, not per-offer figures, so they are kept out of the parsed
  // per-offer table and given no entity type.
  {
    category: "offers", label: "Total revenue from offers", type: "calc", unit: "currency", good: "up",
    formula: "Sum of all offers' revenue", entity_type: null,
  },
  {
    category: "offers", label: "Overall margin", type: "calc", unit: "percent", good: "up",
    formula: "(Total revenue − total delivery cost) ÷ total revenue, weighted, not an average of offer margins",
    entity_type: null,
  },
  {
    category: "offers", label: "Total hours spent delivering", type: "calc", unit: "hours", good: "down",
    formula: "Sum of all offers' hours", entity_type: null,
  },
  {
    category: "offers", label: "Overall effective hourly rate", type: "calc", unit: "currency", good: "up",
    formula: "(Total revenue − total other direct costs) ÷ total hours", entity_type: null,
  },
];

/**
 * Section 6. Prose in 6.3 and 6.5, tables in 6.2 and 6.4, so all of it is
 * listed rather than half parsed and half not.
 *
 * These belong to a launch, not to a month, and their figures live in
 * report_launch_values.
 */
const LAUNCH_METRICS = [
  // 6.2 Stage numbers
  { label: "Sign-ups", type: "core", unit: "count", good: "up" },
  { label: "Live attendees", type: "core", unit: "count", good: "up" },
  { label: "Replay watchers", type: "optional", unit: "count", good: "up" },
  { label: "Live at start", type: "optional", unit: "count", good: "up" },
  { label: "Live at pitch", type: "optional", unit: "count", good: "up" },
  { label: "Live at end of pitch", type: "optional", unit: "count", good: "up" },
  { label: "Show-up rate", type: "calc", unit: "percent", good: "up", formula: "Day 1 live attendees ÷ sign-ups" },
  { label: "Day-by-day drop-off", type: "calc", unit: "percent", good: "up", formula: "Each day's attendees ÷ day 1 attendees" },
  { label: "Pitch retention", type: "calc", unit: "percent", good: "up", formula: "Live at end of pitch ÷ live at start" },
  { label: "Percent of sign-up goal", type: "calc", unit: "percent", good: "up", formula: "Sign-ups ÷ sign-up goal" },
  // 6.3 Emails
  { label: "Email list size sent to", type: "core", unit: "count", good: "up" },
  { label: "Email open rate", type: "core", unit: "percent", good: "up" },
  { label: "Email click rate", type: "core", unit: "percent", good: "up" },
  { label: "Email unique clicks", type: "core", unit: "count", good: "up" },
  { label: "Average open rate per stage", type: "calc", unit: "percent", good: "up", formula: "Mean open rate of the stage's emails" },
  { label: "Average click rate per stage", type: "calc", unit: "percent", good: "up", formula: "Mean click rate of the stage's emails" },
  // 6.4 Sales
  { label: "Sales per price option", type: "core", unit: "count", good: "up" },
  { label: "Sales from stage", type: "core", unit: "count", good: "up" },
  { label: "Sales from email", type: "core", unit: "count", good: "up" },
  { label: "Sales from DM", type: "core", unit: "count", good: "up" },
  { label: "Sales from ads", type: "core", unit: "count", good: "up" },
  { label: "Sales from referral", type: "core", unit: "count", good: "up" },
  { label: "Sales from unknown", type: "core", unit: "count", good: "none" },
  { label: "Cash collected to date", type: "core", unit: "currency", good: "up" },
  { label: "Total sales", type: "calc", unit: "count", good: "up", formula: "Sum of sales per price option" },
  { label: "Total revenue", type: "calc", unit: "currency", good: "up", formula: "Sum of (sales × price) per option, payment plans at full contract value" },
  { label: "Revenue still to collect", type: "calc", unit: "currency", good: "down", formula: "Total revenue − cash collected" },
  { label: "Average order value", type: "calc", unit: "currency", good: "up", formula: "Total revenue ÷ total sales" },
  { label: "Percent of sales goal", type: "calc", unit: "percent", good: "up", formula: "Total sales ÷ the Good, Better and Best targets" },
  { label: "Conversion rate", type: "calc", unit: "percent", good: "up", formula: "Total sales ÷ live attendees of the main selling stage" },
  // 6.5 Pipeline and ads
  { label: "DMs sent", type: "optional", unit: "count", good: "up" },
  { label: "DM replies", type: "optional", unit: "count", good: "up" },
  { label: "Discovery calls", type: "optional", unit: "count", good: "up" },
  { label: "Sales calls booked", type: "optional", unit: "count", good: "up" },
  { label: "Sales calls closed", type: "optional", unit: "count", good: "up" },
  { label: "Not interested", type: "optional", unit: "count", good: "down" },
  { label: "Ad spend", type: "optional", unit: "currency", good: "none" },
  { label: "Ad leads", type: "optional", unit: "count", good: "up" },
  { label: "Ad sales", type: "optional", unit: "count", good: "up" },
  { label: "Reply rate", type: "calc", unit: "percent", good: "up", formula: "DM replies ÷ DMs sent" },
  { label: "Call to close rate", type: "calc", unit: "percent", good: "up", formula: "Sales calls closed ÷ sales calls booked" },
  { label: "Cost per sign-up", type: "calc", unit: "currency", good: "down", formula: "Ad spend ÷ sign-ups" },
  { label: "Cost per sale", type: "calc", unit: "currency", good: "down", formula: "Ad spend ÷ total sales" },
  { label: "Launch ROAS", type: "calc", unit: "ratio", good: "up", formula: "Total revenue ÷ ad spend" },
  // 6.6 Launch planner
  { label: "Live attendees needed", type: "calc", unit: "count", good: "none", formula: "Sales goal ÷ conversion rate, rounded up" },
  { label: "Sign-ups needed", type: "calc", unit: "count", good: "none", formula: "Live attendees needed ÷ show-up rate, rounded up" },
];

function slug(label) {
  return label
    .toLowerCase()
    .replace(/[+]/g, " plus ")
    .replace(/%/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function keyFor(category, label) {
  const base = `${category}_${slug(label)}`;
  return KEY_OVERRIDES[base] ?? base;
}

const CURRENCY_WORDS = /\b(revenue|spend|cost|costs|price|cash|profit|income|value|mrr)\b/;
const PERCENT_WORDS = /\b(rate|margin|%|percent|share|split|growth|retention|churn|drop)\b/;

function inferUnit(key, label) {
  if (UNIT_OVERRIDES[key]) return UNIT_OVERRIDES[key];
  const l = label.toLowerCase();
  if (/\bhours?\b/.test(l)) return "hours";
  if (CURRENCY_WORDS.test(l)) return "currency";
  if (PERCENT_WORDS.test(l)) return "percent";
  if (/\b(followers|follows|subscribers|views|reach|clicks|sold|posts|leads|clients|calls|sales|purchases|impressions|opt|ins|checkouts|saves|shares|likes|comments|visits|dms|unsubscribes|emails|sent|reels|buyers|testimonials|completions|engagers|renewals|upsells|bumps|issues|size|attendees|watchers|ups|replies|interested|closed|booked|raised|received|start|end)\b/.test(l)) {
    return "count";
  }
  throw new Error(`No unit could be inferred for "${label}" (${key}). Add it to UNIT_OVERRIDES.`);
}

const GOOD = { up: "up", down: "down", "n/a": "none", "": "none" };

function parseSection(brief, number, category) {
  const start = brief.indexOf(`### ${number} `);
  if (start === -1) throw new Error(`Section ${number} not found in the brief`);
  // Up to the next "### 5.x" heading or the start of section 6.
  const rest = brief.slice(start + 1);
  const nextHeading = rest.search(/\n### 5\.\d+ |\n## 6\. /);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const rows = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4) continue;                       // not the Field table
    if (cells[0] === "Field" || /^-+$/.test(cells[0].replace(/[: ]/g, "-"))) continue;
    if (cells[0] === "Card") break;                          // 5.9's summary table

    const [label, typeRaw, formulaRaw, goodRaw] = cells;
    const type = typeRaw.toLowerCase();
    if (!["core", "optional", "calc", "pulled"].includes(type)) continue;

    const key = keyFor(category, label);
    if (NOT_METRICS.has(key)) continue;

    const good = GOOD[goodRaw.toLowerCase()];
    if (good === undefined) throw new Error(`Unknown "Good" value ${JSON.stringify(goodRaw)} for ${key}`);

    rows.push({
      key,
      category,
      label,
      input_type: type,
      unit: inferUnit(key, label),
      good_direction: good,
      // A calc or pulled field must say where it comes from; the table's
      // Formula cell is empty for plenty of inputs, which is fine.
      formula: formulaRaw || null,
      entity_type: ENTITY_TYPE[category] ?? null,
    });
  }
  if (rows.length === 0) throw new Error(`Section ${number} parsed to no metrics`);
  return rows;
}

function build(brief) {
  const metrics = [];
  for (const [number, category] of Object.entries(SECTIONS)) {
    metrics.push(...parseSection(brief, number, category));
  }

  for (const m of PROSE_METRICS) {
    const key = m.key ?? keyFor(m.category, m.label);
    metrics.push({
      key,
      category: m.category,
      label: m.label,
      input_type: m.type,
      unit: m.unit,
      good_direction: m.good,
      formula: m.formula ?? null,
      entity_type: m.entity_type !== undefined ? m.entity_type : (ENTITY_TYPE[m.category] ?? null),
    });
  }

  for (const m of LAUNCH_METRICS) {
    metrics.push({
      key: keyFor("launches", m.label),
      category: "launches",
      label: m.label,
      input_type: m.type,
      unit: m.unit,
      good_direction: m.good,
      formula: m.formula ?? null,
      entity_type: null,
    });
  }

  // A calc metric without a formula would trip the table's check constraint at
  // insert time; catching it here says which one and why.
  for (const m of metrics) {
    if (m.input_type === "calc" && !m.formula) {
      throw new Error(`Calc metric ${m.key} has no formula. The brief's table cell is empty — add it to PROSE_METRICS or LAUNCH_METRICS.`);
    }
  }

  const seen = new Map();
  for (const m of metrics) {
    if (seen.has(m.key)) throw new Error(`Duplicate metric key ${m.key} (${seen.get(m.key)} and ${m.label})`);
    seen.set(m.key, m.label);
  }

  // sort_order runs within a category, in the order the brief lists them.
  const counters = {};
  for (const m of metrics) {
    counters[m.category] = (counters[m.category] ?? 0) + 1;
    m.sort_order = counters[m.category];
  }

  return metrics;
}

const q = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

function toSql(metrics) {
  const rows = metrics
    .map((m) =>
      `  (${q(m.key)}, ${q(m.category)}, ${q(m.label)}, ${q(m.input_type)}, ` +
      `${q(m.unit)}, ${q(m.good_direction)}, ${m.entity_type ? q(m.entity_type) : "null"}, ` +
      `${q(m.formula)}, ${m.sort_order})`,
    )
    .join(",\n");

  return `-- aOS Reporting Tool — the seeded metric list.
--
-- GENERATED FILE. Do not edit by hand: run
--   node scripts/generate-report-metrics-seed.mjs
-- which reads the tables in section 5 (and the explicitly listed section 6
-- launch fields) straight out of docs/reporting/reporting-tool-brief.md. The
-- schema test runs the generator with --check, so a hand edit here fails the
-- build rather than quietly disagreeing with the spec.
--
-- ${metrics.length} metrics across ${new Set(metrics.map((m) => m.category)).size} categories.

insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
${rows}
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  input_type = excluded.input_type,
  unit = excluded.unit,
  good_direction = excluded.good_direction,
  entity_type = excluded.entity_type,
  formula = excluded.formula,
  sort_order = excluded.sort_order;
`;
}

const brief = await readFile(BRIEF, "utf8");
const metrics = build(brief);
const sql = toSql(metrics);

if (process.argv.includes("--print")) {
  console.table(
    metrics.map(({ key, category, input_type, unit, good_direction, entity_type }) => ({
      key, category, input_type, unit, good_direction, entity_type,
    })),
  );
  console.log(`\n${metrics.length} metrics`);
} else if (process.argv.includes("--check")) {
  const current = await readFile(OUT, "utf8").catch(() => "");
  if (current !== sql) {
    console.error(
      "report_metrics seed is stale. Run: node scripts/generate-report-metrics-seed.mjs",
    );
    process.exit(1);
  }
  console.log(`report_metrics seed is current (${metrics.length} metrics)`);
} else {
  await writeFile(OUT, sql);
  console.log(`Wrote ${metrics.length} metrics to ${path.relative(ROOT, OUT)}`);
}
