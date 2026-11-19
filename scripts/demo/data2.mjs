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
/**
 * The demo's launches (Nina's final spec, 19 November).
 *
 * **Two of them carry everything** — a completed one and a live one, in
 * her words — and the third is still being planned, because a launches
 * page with nothing in planning never shows what that state looks like.
 *
 * Every figure below is keyed to the thing it belongs to when it is
 * written: a stage, a stage and a day, a stage and an email, a price
 * option or a source. **Until today they were all keyed at launch
 * level**, which is why the demo's launch page showed no funnel, no
 * email chart, no price-option sales, and dashes for all four of its
 * headline cards: the page reads sign-ups per STAGE and sales per PRICE,
 * and the demo had written neither. Her item 0, and found by looking at
 * a screen nobody had screenshotted.
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
      signUpGoals: [300, 400, 500],
      signUps: 412,
      attendees: 194,
      atPitch: 138,
      sales: 27,
      revenue: 42_650,
      cash: 38_900,
      stageStart: `${y}-01-05`,
      // **The completed one beat its plan and the live one is behind
      // it**, which is the only way the conversion check (her item 5)
      // shows both of its answers on one demo. Nothing is tuned to
      // flatter: these are the rates a launch would have been planned
      // against, and the figures above are what happened.
      // 104 of 222 is 46.8%, so a 47% assumption reads "behind" by two
      // tenths of a point — true, and a silly thing for a demo to say.
      // The plan this launch was actually made against is the honest
      // number, and the live one below shows what "behind" looks like
      // where it means something.
      planner: { showUp: 45, conversion: 5.6 },
      // A plausible share link, with nothing real behind it. The point of
      // the field is that the names live in their Drive and not in aOS.
      tracker: "https://docs.google.com/spreadsheets/d/1LemonStudioJanLaunchLeads/edit",
    },
    {
      name: "Signature Course — November",
      description: "The autumn run of the signature programme, with a 3-day challenge in front of it.",
      offer: "Group Programme",
      status: "live",
      month: currentMonth,
      goals: [10, 20, 30],
      signUpGoals: [250, 320, 400],
      signUps: 250,
      attendees: 118,
      atPitch: 84,
      sales: 14,
      revenue: 24_850,
      cash: 21_400,
      stageStart: `${currentMonth.slice(0, 7)}-01`,
      // Behind on conversion and on track on show-up, which is the pair
      // worth showing: the room filled and the pitch did not land.
      planner: { showUp: 45, conversion: 12 },
      tracker: "https://docs.google.com/spreadsheets/d/1LemonStudioNovLaunchLeads/edit",
    },
    {
      name: "Mastermind",
      description: "A twelve-month room for founders past their first £100k.",
      offer: "1:1 Coaching Package",
      status: "planning",
      month: `${y + 1}-03-01`,
      goals: [8, 15, 22],
      signUpGoals: [120, 180, 240],
      signUps: null,
      stageStart: `${y + 1}-03-02`,
      planner: { showUp: 47, conversion: 5 },
      tracker: null,
    },
  ];
}

const day = (from, add) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
};

export function stagesFor(launch) {
  const s = launch.stageStart;
  return [
    { position: 1, stage_type: "other", name: "Challenge Promo", promo_start: s, promo_end: day(s, 6) },
    { position: 2, stage_type: "challenge", name: "Challenge (3 days)", live_start: day(s, 7), live_end: day(s, 9), live_days: 3, sign_up_goal: 300, attendance_goal: 150 },
    { position: 3, stage_type: "other", name: "Masterclass Promo", promo_start: day(s, 10), promo_end: day(s, 16) },
    // **The masterclass is where the selling happens**, not the open
    // cart: the pitch is given there, so that is the stage the pitch
    // figures and the conversion rate belong to. The first cut flagged
    // the open cart and gave it the masterclass's attendance as well,
    // which drew the same funnel twice under two headings.
    { position: 4, stage_type: "masterclass", name: "Masterclass", live_start: day(s, 17), live_end: day(s, 17), live_days: 1, sign_up_goal: 220, attendance_goal: 110, is_main_selling_stage: true },
    { position: 5, stage_type: "open_cart", name: "Open Cart", promo_start: day(s, 18), promo_end: day(s, 24) },
  ];
}

/**
 * The price options: one paid in full, one paid monthly (her item 3).
 *
 * The monthly one is what makes MRR mean anything on the demo — with two
 * pay-in-full options the card would be absent, and the figure she asked
 * for would not appear on the screen she asked for it on. `price` is the
 * full contract value either way, which is what total revenue counts.
 */
export function pricesFor(launch) {
  const mastermind = launch.name.startsWith("Mastermind");
  const perMonth = mastermind ? 550 : 660;
  const months = mastermind ? 12 : 3;
  return [
    {
      name: "Pay in full",
      plan: "full",
      price: mastermind ? 6_000 : 1_850,
      instalments: null,
      instalment_amount: null,
      is_main: true,
      // Most of the demo's sales are the full price, which is the shape
      // of a real launch and makes the monthly line a minority rather
      // than a rounding error.
      share: 0.63,
    },
    {
      name: `Monthly, ${months} months`,
      plan: "monthly",
      price: perMonth * months,
      instalments: months,
      instalment_amount: perMonth,
      is_main: false,
      share: 0.37,
    },
  ];
}

/** Sales per price option, which is where total revenue comes from. */
export function priceSales(launch) {
  if (launch.signUps === null) return [];
  const prices = pricesFor(launch);
  const full = Math.round(launch.sales * prices[0].share);
  return [
    { name: prices[0].name, sales: full },
    { name: prices[1].name, sales: Math.max(0, launch.sales - full) },
  ];
}

/**
 * The client's own sources, with a target each (her item 6).
 *
 * Named the way a client would name them rather than the way the old
 * six metrics did, and **one of them deliberately misses**: Meta ads
 * come in under target while the email list beats it, which is the
 * comparison the panel exists to make. A demo where every source hits
 * its number shows a table of ticks and teaches nothing.
 */
export function sourcesFor(launch) {
  if (launch.signUps === null) return [];
  const shares = [
    { name: "Email list", target: 0.38, share: 0.42, converts: 0.085 },
    { name: "Meta ads", target: 0.34, share: 0.26, converts: 0.045 },
    { name: "Instagram", target: 0.18, share: 0.21, converts: 0.06 },
    { name: "DMs", target: 0.08, share: 0.07, converts: 0.14 },
    { name: "Not sure", target: null, share: 0.04, converts: 0.03 },
  ];

  /**
   * Hand a total out across the shares, exactly.
   *
   * **The remainder goes on the last row rather than being rounded
   * away**, which is the same trick `dailySignUps` uses and for the same
   * reason: the report checks that the sources add up to the launch, and
   * a demo that opens with its own "the sources account for 29 of 27
   * sales" warning is a demo arguing with itself. "Not sure" is last on
   * purpose — the figures nobody can place are the ones that absorb it.
   */
  const spread = (total, weights) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    let given = 0;
    return weights.map((weight, i) => {
      if (i === weights.length - 1) return Math.max(0, total - given);
      const value = Math.max(0, Math.round((weight / sum) * total));
      given += value;
      return value;
    });
  };

  const signUps = spread(
    launch.signUps,
    shares.map((s) => s.share),
  );
  const sales = spread(
    launch.sales,
    // Weighted by what each source's sign-ups would convert at, so the
    // split is the one its own conversion rate implies rather than an
    // even share — Meta ads bring the second-most people and the fewest
    // buyers, which is the comparison the panel is for.
    shares.map((s, i) => signUps[i] * s.converts),
  );

  return shares.map((source, i) => ({
    name: source.name,
    position: i + 1,
    sign_up_target: source.target === null ? null : Math.round(launch.signUps * source.target),
    signUps: signUps[i],
    sales: sales[i],
  }));
}

/**
 * Sign-ups day by day, adding up to the launch's own total (her item 7).
 *
 * **Shaped, not flat.** The two spikes are the days the promo emails
 * went and the day the cart opened, because a running total drawn from
 * an even spread is a straight line and says nothing about a launch. It
 * is the launch's 25-day span, and the last day's running total is the
 * sign-up figure the rest of the page reads.
 */
export function dailySignUps(launch) {
  if (launch.signUps === null) return [];
  const days = 25;
  // A weight per day: quiet, then the promo, then a lull, then the cart.
  const weights = Array.from({ length: days }, (_unused, i) => {
    const d = i + 1;
    const base = d <= 7 ? 2.2 : d <= 10 ? 1.1 : d <= 17 ? 1.6 : 0.8;
    const spike = d === 2 || d === 5 ? 2.4 : d === 12 || d === 17 ? 2.0 : 1;
    return jitter(`${launch.name}:day:${d}`, base * spike, 0.25);
  });
  const total = weights.reduce((a, b) => a + b, 0);

  // Handed out proportionally, with the remainder on the last day, so the
  // running total lands exactly on the launch's sign-ups rather than a
  // rounding or two away from it — the chart and the cards have to agree.
  let given = 0;
  return weights.map((weight, i) => {
    const last = i === weights.length - 1;
    const value = last
      ? launch.signUps - given
      : Math.max(0, Math.round((weight / total) * launch.signUps));
    given += value;
    return { day: i + 1, value };
  });
}

/**
 * Every figure that belongs to a stage, a day or an email.
 *
 * The attendance is split across the challenge's three days with the
 * drop-off a real challenge has, and the masterclass — the selling
 * stage — carries the pitch figures. Sign-ups are per stage, which is
 * what the funnels and the conversion rate read.
 */
export function stageValues(launch) {
  if (launch.signUps === null) return [];
  const challenge = Math.round(launch.signUps * 0.73);
  const masterclass = launch.signUps - challenge + Math.round(launch.signUps * 0.27);
  const dayOne = launch.attendees;

  return [
    { stage: 2, metric: "launches_sign_ups", value: challenge },
    { stage: 2, metric: "launches_live_attendees", day: 1, value: dayOne },
    { stage: 2, metric: "launches_live_attendees", day: 2, value: Math.round(dayOne * 0.82) },
    { stage: 2, metric: "launches_live_attendees", day: 3, value: Math.round(dayOne * 0.71) },
    { stage: 2, metric: "launches_replay_watchers", value: Math.round(dayOne * 0.72) },
    { stage: 4, metric: "launches_sign_ups", value: masterclass },
    { stage: 4, metric: "launches_live_attendees", day: 1, value: Math.round(masterclass * 0.47) },
    { stage: 4, metric: "launches_replay_watchers", value: Math.round(masterclass * 0.31) },
    // The pitch, on the stage that gave it.
    { stage: 4, metric: "launches_live_at_start", value: Math.round(masterclass * 0.47) },
    { stage: 4, metric: "launches_live_at_pitch", value: launch.atPitch },
    { stage: 4, metric: "launches_live_at_end_of_pitch", value: Math.round(launch.atPitch * 0.81) },
  ];
}

/**
 * The launch's emails: a row each, with its words (her item 9).
 *
 * Eight of them across the three stages that send, **one a resend**, and
 * the open rates fall through the sequence the way a real one does. The
 * resend is the shape worth having in a demo: a lower open rate on the
 * same subject, which is the thing the table makes visible and a chart
 * of averages hides.
 */
export function emailsFor(launch) {
  if (launch.signUps === null) return [];
  const s = launch.stageStart;
  const list = 8_900;
  const rows = [
    { stage: 1, number: 1, on: day(s, 0), subject: "Doors open: the 3-day challenge starts Monday", open: 44.8, click: 6.2 },
    { stage: 1, number: 2, on: day(s, 3), subject: "What we're covering on day one", open: 41.2, click: 5.1 },
    { stage: 1, number: 3, on: day(s, 6), subject: "Last call to join us tomorrow", open: 38.6, click: 4.4 },
    { stage: 1, number: 4, on: day(s, 6), subject: "Last call to join us tomorrow", open: 22.4, click: 2.1, resend: true },
    { stage: 3, number: 1, on: day(s, 11), subject: "The masterclass replay is up for 48 hours", open: 39.4, click: 5.8 },
    { stage: 3, number: 2, on: day(s, 15), subject: "The one thing people ask me after the challenge", open: 35.1, click: 4.0 },
    { stage: 5, number: 1, on: day(s, 18), subject: "Enrolment is open", open: 42.6, click: 7.4 },
    { stage: 5, number: 2, on: day(s, 24), subject: "Closing tonight at midnight", open: 46.9, click: 9.1 },
  ];
  return rows.map((row) => {
    const sentTo = Math.round(jitter(`${launch.name}:sent:${row.stage}:${row.number}`, list, 0.06));
    const clicks = Math.round((sentTo * row.open * row.click) / 10_000);
    return {
      ...row,
      sentTo,
      uniqueClicks: clicks,
      // The gap the figure exists to show: most of a launch email's
      // clicks are people who looked and did not sign up.
      clickedNoSignUp: Math.max(0, Math.round(clicks * 0.72)),
    };
  });
}

/** Everything the launch page reads at launch level. */
export function launchValues(launch) {
  if (launch.signUps === null) return {};
  const adSignUps = Math.round(launch.signUps * 0.26);
  return {
    launches_cash_collected_to_date: launch.cash,
    launches_dms_sent: 180,
    launches_dm_replies: 64,
    launches_discovery_calls: 31,
    launches_sales_calls_booked: 24,
    launches_sales_calls_closed: Math.round(launch.sales * 0.5),
    launches_not_interested: 11,
    // Her item 8. The budget and the target are the plan; the rest is
    // what Meta reported, and the demo's numbers are consistent with it
    // — spend ÷ sign-ups lands near the target rather than nowhere near.
    launches_ad_budget: 3_000,
    launches_target_cost_per_sign_up: 22,
    launches_ad_spend: 2_400,
    launches_ad_clicks: 1_840,
    launches_ad_leads: adSignUps,
    launches_ad_sales: Math.max(0, Math.round(launch.sales * 0.07)),
  };
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

/**
 * What kind each demo platform's three top posts were, per platform
 * (§5.2 step 3, 18 November).
 *
 * It was one list of four — reel, carousel, photo, video — dealt out to
 * all four platforms in turn, so the demo had LinkedIn reels and
 * YouTube carousels on a screen built to show that a LinkedIn post
 * cannot be a Reel.
 *
 * Kept in step with `src/lib/reporting/platform-post-types.ts` by the
 * test in `supabase/tests/top-posts.test.mjs`, which refuses a type no
 * platform of that kind offers. It is not imported from there because
 * these are the three a demo SHOWS, picked to look like a real month:
 * a video, a photo and a carousel reads better than three videos.
 */
/**
 * Which of a post's five stored figures each platform actually reports.
 *
 * `report_top_posts` has fixed columns, so a demo that filled all five
 * for all four platforms gave TikTok a reach and YouTube a save. Kept
 * in step with `platform-post-types.ts` by the test in
 * `supabase/tests/top-posts.test.mjs`.
 */
export const POST_FIGURES_BY_KIND = {
  instagram: ["reach", "views", "likesPlusComments", "saves", "shares"],
  linkedin: ["reach", "likesPlusComments", "shares"],
  tiktok: ["views", "likesPlusComments", "saves", "shares"],
  facebook: ["reach", "likesPlusComments", "shares"],
  youtube: ["views", "likesPlusComments"],
  other: ["reach", "views", "likesPlusComments", "saves", "shares"],
};

export const POST_TYPES_BY_KIND = {
  instagram: ["reel", "carousel", "photo"],
  linkedin: ["text", "photo", "carousel"],
  tiktok: ["video", "carousel", "video"],
  facebook: ["photo", "video", "link"],
  youtube: ["video", "reel", "video"],
  other: ["photo", "video", "carousel"],
};
