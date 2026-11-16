/**
 * The money, the launches and the words — the second half of the demo
 * year. Split from `data.mjs` only for length; the rules are the same.
 */

function prng(seed) {
  let a = 0;
  for (let i = 0; i < seed.length; i += 1) a = (a * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const jitter = (seed, value, pct = 0.08) => value * (1 + (prng(seed)() - 0.5) * 2 * pct);
const round = (n) => Math.round(n);
const money = (n) => Math.round(n * 100) / 100;

/**
 * Four offers, priced and costed so the page has something to say.
 *
 * **One of them is deliberately bad.** "Done-with-you Launch" earns the
 * most per sale and keeps the least: 30 hours and heavy direct costs put
 * it at about 38%, under the 45% margin target, which is the warning
 * the Offers mock-up draws and the reason that page exists. A demo where
 * every offer is healthy demonstrates nothing.
 */
export const OFFERS = [
  { name: "1:1 Coaching Package", price: 2_500, model: "one_off", hourlyCost: 40, units: 4, hours: 20, odc: 1_900 },
  { name: "Group Programme", price: 250, model: "recurring", hourlyCost: 35, units: 22, hours: 28, odc: 65 },
  { name: "VIP Day", price: 1_500, model: "one_off", hourlyCost: 45, units: 3, hours: 18, odc: 945 },
  { name: "Done-with-you Launch", price: 4_850, model: "one_off", hourlyCost: 55, units: 1, hours: 30, odc: 1_350 },
];

export function offerMonth(offer, index, total) {
  const seed = `${offer.name}:${index}`;
  const t = index / (total - 1);
  const units = Math.max(1, round(jitter(`${seed}:u`, offer.units * (0.6 + 0.6 * t), 0.22)));
  const hours = round(jitter(`${seed}:h`, (offer.hours / offer.units) * units, 0.12));
  return {
    units,
    revenue: money(units * offer.price),
    values: {
      offers_units_sold: units,
      offers_hours_spent_delivering: hours,
      offers_other_direct_costs: money(jitter(`${seed}:c`, (offer.odc / offer.units) * units, 0.15)),
    },
  };
}

/**
 * Which offers the month's converted calls bought (§5.6, Nina 16 Nov).
 *
 * **Weighted towards the high-touch offers, and capped by what that
 * offer actually sold.** The Group Programme is mostly bought off the
 * webinar funnel rather than a call, and the demo would contradict
 * itself if it showed six sales from calls of an offer whose Offers
 * page says three units all month. The cap is what keeps the two pages
 * telling one story.
 *
 * The remainder is handed out largest-first so the rows add up to
 * `converted` exactly where the cap allows — a breakdown that silently
 * totals less than the funnel's last step is a question nobody can
 * answer, and where the cap does bite the page says so by totalling
 * less, which is honest: some of those calls bought something bespoke.
 */
const CALL_WEIGHTS = {
  "1:1 Coaching Package": 0.42,
  "VIP Day": 0.26,
  "Group Programme": 0.22,
  "Done-with-you Launch": 0.1,
};

/**
 * How much of a month's converted calls is bespoke work.
 *
 * Dom, 16 November: Nina's agency-style clients sell a great deal of work
 * priced per job, so the demo has to show it or the breakdown teaches the
 * wrong lesson. About a third of the calls, at a job price between the VIP
 * Day and the Done-with-you Launch — big enough to be the top bar some
 * months, which is the point.
 */
export function bespokeWins(index, converted) {
  if (!converted) return { sales: null, value: null };
  const seed = `bespoke:${index}`;
  const sales = Math.max(1, Math.round(converted * jitter(`${seed}:n`, 0.3, 0.4)));
  return {
    sales,
    value: Math.round(sales * jitter(`${seed}:v`, 2_650, 0.3) / 50) * 50,
  };
}

export function callWins(index, total, converted) {
  if (!converted) return [];

  const caps = new Map(
    OFFERS.map((o) => [o.name, offerMonth(o, index, total).units]),
  );
  const exact = OFFERS.map((o) => ({
    offer: o.name,
    want: converted * (CALL_WEIGHTS[o.name] ?? 0),
  }));

  const rows = exact.map((e) => ({
    offer: e.offer,
    sales: Math.min(Math.floor(e.want), caps.get(e.offer) ?? 0),
    remainder: e.want - Math.floor(e.want),
  }));

  let left = converted - rows.reduce((t, r) => t + r.sales, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break;
    const room = (caps.get(row.offer) ?? 0) - row.sales;
    if (room <= 0) continue;
    row.sales += 1;
    left -= 1;
  }

  return rows.filter((r) => r.sales > 0).map(({ offer, sales }) => ({ offer, sales }));
}

/** The retainer clients, which is where the recurring money comes from. */
export const CLIENT_ROWS = [
  { name: "Harbour & Co", amount: 1_200 },
  { name: "Studio Verde", amount: 950 },
  { name: "Northgate Dental", amount: 1_500 },
];

export const EXPENSES = [
  { name: "Software", bucket: "fixed", amount: 340 },
  { name: "Accountant", bucket: "fixed", amount: 180 },
  { name: "Insurance", bucket: "fixed", amount: 45 },
  { name: "Payment fees", bucket: "variable", amount: 210 },
  { name: "Contractors", bucket: "variable", amount: 1_150 },
  { name: "Ad spend", bucket: "variable", amount: 3_230 },
  { name: "Team salaries", bucket: "team", amount: 3_800 },
  { name: "Virtual assistant", bucket: "team", amount: 620 },
  { name: "Coaching & training", bucket: "investment", amount: 500 },
  { name: "Equipment", bucket: "investment", amount: 180 },
];

export const STAFF = [
  { name: "Sofia — delivery", rate: 28 },
  { name: "Marco — support", rate: 18 },
  { name: "Elena — design", rate: 32 },
];

export const expenseMonth = (expense, index) =>
  money(jitter(`${expense.name}:${index}`, expense.amount * (0.9 + index * 0.012), 0.12));

/**
 * Three launches: one finished, one running now, one still on paper.
 *
 * The three statuses are the point — the cards, the stage timeline and
 * the planner each read differently depending on which one is open, and
 * a demo with only finished launches would show one third of the page.
 */
export function launches(currentMonth) {
  const [y] = currentMonth.split("-").map(Number);
  return [
    {
      name: "Signature Course — January",
      description: "6-week transformational programme for service-based business owners.",
      offer: "Group Programme",
      status: "completed",
      month: `${y}-01-01`,
      goals: [10, 20, 30],
      signUps: 412,
      attendees: 194,
      atPitch: 138,
      sales: 27,
      revenue: 42_650,
      cash: 38_900,
      stageStart: `${y}-01-05`,
    },
    {
      name: "Signature Course — November",
      description: "The autumn run of the signature programme, with a 3-day challenge in front of it.",
      offer: "Group Programme",
      status: "live",
      month: currentMonth,
      goals: [10, 20, 30],
      signUps: 250,
      attendees: 118,
      atPitch: 84,
      sales: 14,
      revenue: 24_850,
      cash: 21_400,
      stageStart: `${currentMonth.slice(0, 7)}-01`,
    },
    {
      name: "Mastermind",
      description: "A twelve-month room for founders past their first £100k.",
      offer: "1:1 Coaching Package",
      status: "planning",
      month: `${y + 1}-03-01`,
      goals: [8, 15, 22],
      signUps: null,
      stageStart: `${y + 1}-03-02`,
    },
  ];
}

/** The five stages every launch here runs, in order. */
export function stagesFor(launch) {
  const day = (from, add) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + add);
    return d.toISOString().slice(0, 10);
  };
  const s = launch.stageStart;
  return [
    { position: 1, stage_type: "other", name: "Challenge Promo", promo_start: s, promo_end: day(s, 6) },
    { position: 2, stage_type: "challenge", name: "Challenge (3 days)", live_start: day(s, 7), live_end: day(s, 9), live_days: 3, sign_up_goal: 300, attendance_goal: 150 },
    { position: 3, stage_type: "other", name: "Masterclass Promo", promo_start: day(s, 10), promo_end: day(s, 16) },
    { position: 4, stage_type: "masterclass", name: "Masterclass", live_start: day(s, 17), live_end: day(s, 17), live_days: 1, sign_up_goal: 220, attendance_goal: 110 },
    { position: 5, stage_type: "open_cart", name: "Open Cart", promo_start: day(s, 18), promo_end: day(s, 24), is_main_selling_stage: true },
  ];
}

/** Sales by source, which is the donut on the launch page. */
export function salesBySource(launch) {
  if (launch.signUps === null) return {};
  const total = launch.sales;
  const stage = Math.round(total * 0.5);
  const email = Math.round(total * 0.29);
  const dm = Math.round(total * 0.14);
  const ads = Math.max(0, total - stage - email - dm);
  return {
    launches_sales_from_stage: stage,
    launches_sales_from_email: email,
    launches_sales_from_dm: dm,
    launches_sales_from_ads: ads,
    launches_sales_from_referral: 0,
    launches_sales_from_unknown: 0,
  };
}

/** Everything the launch page reads at launch level. */
export function launchValues(launch) {
  if (launch.signUps === null) return {};
  return {
    launches_sign_ups: launch.signUps,
    launches_live_attendees: launch.attendees,
    launches_replay_watchers: Math.round(launch.attendees * 0.72),
    launches_live_at_start: launch.attendees,
    launches_live_at_pitch: launch.atPitch,
    launches_live_at_end_of_pitch: Math.round(launch.atPitch * 0.81),
    launches_email_list_size_sent_to: 8_900,
    launches_email_open_rate: 41.2,
    launches_email_click_rate: 4.6,
    launches_email_unique_clicks: 409,
    launches_cash_collected_to_date: launch.cash,
    launches_dms_sent: 180,
    launches_dm_replies: 64,
    launches_discovery_calls: 31,
    launches_sales_calls_booked: 24,
    launches_sales_calls_closed: Math.round(launch.sales * 0.5),
    launches_not_interested: 11,
    launches_ad_spend: 2_400,
    launches_ad_leads: 142,
    launches_ad_sales: Math.max(0, Math.round(launch.sales * 0.07)),
    ...salesBySource(launch),
  };
}

/** Open rate per email across the launch — the line chart in the mock-up. */
export function launchEmailRates(launch) {
  if (launch.signUps === null) return [];
  return Array.from({ length: 12 }, (_, i) => ({
    email_number: i + 1,
    open_rate: Math.round(jitter(`${launch.name}:email:${i}`, 34 + Math.sin(i / 2) * 9 + i * 0.5, 0.08) * 10) / 10,
  }));
}

export const HOOKS = [
  "The pricing mistake that keeps you booked but broke",
  "Three words that doubled my reply rate",
  "What I'd do with 90 minutes and no audience",
  "Why your discovery call is losing the sale",
  "The offer I deleted, and what replaced it",
  "Stop posting daily. Do this instead.",
];

export const B_ROLL = [
  "Desk set-up, morning light, coffee being poured",
  "Walking shot through the studio door",
  "Notebook close-up with the pricing grid",
  "Client call on screen, over the shoulder",
];

export const POST_TYPES = ["reel", "carousel", "photo", "video"];
