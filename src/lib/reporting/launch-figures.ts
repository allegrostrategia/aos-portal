import { launch as launchFormulas, type LaunchPriceOption } from "./formulas.ts";
import { launchFirstDay } from "./launch-dates.ts";
import { launchLastDay } from "./locked.ts";
import type {
  LaunchDetail,
  LaunchEmail,
  LaunchPrice,
  LaunchSource,
  LaunchStage,
} from "./launch-queries.ts";
import { hasLiveEvent } from "./stage-labels.ts";

/**
 * A launch's worked-out figures, in one place.
 *
 * Every number here comes from `formulas.ts`. This module decides **which
 * figures go into which formula** — which is where §6's real complexity
 * is, because a launch's figures hang off four different things: a stage,
 * a stage and a day, a stage and an email, or a price option.
 *
 * Nothing recomputes anything `formulas.ts` already knows how to do. §9's
 * rule is that two implementations of the same arithmetic disagree, and
 * the Offers screen has already paid for proving it.
 */

export interface LaunchSummary {
  totalSales: number | null;
  totalRevenue: number | null;
  cashCollected: number | null;
  revenueStillToCollect: number | null;
  averageOrderValue: number | null;
  /** Against Good, Better and Best — §6.1's three targets. */
  percentOfGood: number | null;
  percentOfBetter: number | null;
  percentOfBest: number | null;
  conversionRate: number | null;
  /** Monthly recurring revenue, from the monthly price options only. */
  mrr: number | null;
  /** Sign-ups across every stage, which is what the goals are read against. */
  totalSignUps: number | null;
}

export interface StageFigures {
  stage: LaunchStage;
  signUps: number | null;
  /** One per live day, in order, so the drop-off reads left to right. */
  attendeesByDay: (number | null)[];
  showUpRate: number | null;
  dayDropOff: (number | null)[];
  /**
   * How many were still there when the pitch finished, and that as a
   * share of the room at the start of the session.
   *
   * Both, because Nina asked for both on 28 October: a percentage on its
   * own is a figure nobody can sanity-check, and "41 of the 68 who
   * started were still there" is the sentence she would say out loud.
   */
  liveAtEndOfPitch: number | null;
  liveAtStart: number | null;
  pitchRetention: number | null;
  percentOfSignUpGoal: number | null;
  averageOpenRate: number | null;
  averageClickRate: number | null;
}

/**
 * Add up what is there, null when nothing is.
 *
 * `formulas.ts` keeps its `sum` private — deliberately, so arithmetic
 * lives there rather than leaking out one helper at a time — and the two
 * places below that add a list of figures up are both "which figures",
 * not "how to add". Same convention as everywhere else: a missing figure
 * is skipped, and all-missing is a dash rather than a zero.
 */
function sumOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/** The price options as the formulas want them. */
function priceOptions(detail: LaunchDetail): LaunchPriceOption[] {
  return detail.prices.map((p: LaunchPrice) => ({
    name: p.name,
    price: p.price,
    plan: p.plan,
    monthlyAmount: p.instalment_amount,
    sales: detail.values.get("launches_sales_per_price_option", { priceId: p.id }),
    isMain: p.is_main,
  }));
}

/**
 * **The six fixed sources are gone from here** (Nina's item 6,
 * 19 November).
 *
 * They were six metrics — stage, email, DM, ads, referral, unknown —
 * which meant the list was ours rather than the client's, could not
 * carry a target, and counted sales only. `sourceFigures` below reads
 * `report_launch_sources` instead, and the migration carried every
 * existing figure over to it under its own label.
 *
 * The metrics themselves are kept and their figures were copied, not
 * moved: nothing is ever deleted, and a launch typed before today still
 * holds what somebody said about it. Nothing reads them now, which is
 * the point of there being one reading.
 */

export function launchSummary(detail: LaunchDetail): LaunchSummary {
  const options = priceOptions(detail);
  const totalSales = launchFormulas.totalSales(options);
  const totalRevenue = launchFormulas.totalRevenue(options);
  const cashCollected = detail.values.get("launches_cash_collected_to_date");

  // **Conversion is sales ÷ sign-ups to the main selling stage** — Nina,
  // 28 October, overruling §6.4's "live attendees of the main selling
  // stage". Her reason is the one that decides which number a launch is
  // judged by: everybody who signed up is somebody the launch persuaded
  // to commit, and measuring against only those who then turned up
  // flatters a launch with a bad show-up rate. The show-up rate is its
  // own figure and says that part.
  //
  // Which stage needs no picking. A launch can have several live stages,
  // but exactly one main selling stage: `report_launch_stages_one_main`
  // is a partial unique index on it, and saving the stages clears the old
  // flag before setting the new one. No flag means no conversion rate,
  // which is a dash rather than a guess.
  const mainStage = detail.stages.find((s) => s.is_main_selling_stage) ?? null;
  const mainSignUps = mainStage
    ? detail.values.get("launches_sign_ups", { stageId: mainStage.id })
    : null;

  return {
    totalSales,
    totalRevenue,
    cashCollected,
    mrr: launchFormulas.mrr(options),
    totalSignUps: launchSignUps(detail),
    revenueStillToCollect: launchFormulas.revenueStillToCollect(totalRevenue, cashCollected),
    averageOrderValue: launchFormulas.averageOrderValue(totalRevenue, totalSales),
    percentOfGood: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_good),
    percentOfBetter: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_better),
    percentOfBest: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_best),
    conversionRate: launchFormulas.conversionRate(totalSales, mainSignUps),
  };
}

/**
 * How many signed up to this LAUNCH (Nina's item 4 reads its goals
 * against this).
 *
 * **Never the stages added up**, which is the obvious implementation and
 * is wrong: a launch's stages are sequential, so somebody who joins the
 * challenge and then the masterclass is one person who signed up twice.
 * The first build did sum them, and the seed's 1,277 and 900 came out as
 * 2,177 on the goal panel while the running-total chart three inches
 * above it said 1,277 — two figures for the same thing on one page.
 *
 * So, in order:
 *
 *   · **The day-by-day total**, where the client has typed days. It is
 *     the launch's own count, entered as exactly that, and it is what
 *     the chart beside the goals draws.
 *   · **Otherwise the first stage that has sign-ups** — the top of the
 *     funnel, which is everybody the launch brought in. A later stage is
 *     a subset of it, which is why the funnels measure each step against
 *     the step above rather than against a total.
 *
 * A stage keeps its own goal as well (`percentOfSignUpGoal`), which
 * answers the narrower question of whether the challenge filled.
 */
function launchSignUps(detail: LaunchDetail): number | null {
  const byDay = dayGrid(detail);
  const daily = byDay.at(-1)?.runningTotal ?? null;
  if (daily !== null) return daily;

  for (const stage of detail.stages) {
    const signUps = detail.values.get("launches_sign_ups", { stageId: stage.id });
    if (signUps !== null) return signUps;
  }
  return null;
}

/** Day one's attendees, which is what every attendance figure keys off. */
function dayOneAttendees(detail: LaunchDetail, stage: LaunchStage): number | null {
  return detail.values.get("launches_live_attendees", { stageId: stage.id, day: 1 });
}

function attendeesByDay(detail: LaunchDetail, stage: LaunchStage): (number | null)[] {
  const days = stage.live_days ?? 1;
  return Array.from({ length: Math.max(days, 1) }, (_unused, i) =>
    detail.values.get("launches_live_attendees", { stageId: stage.id, day: i + 1 }),
  );
}

/**
 * How many emails a stage has figures for.
 *
 * Counted from what is stored rather than from a column, because §6.3
 * does not fix a number — a stage has as many emails as were sent, and
 * the chart draws the ones that exist.
 */
const MAX_EMAILS = 20;

function emailRates(
  detail: LaunchDetail,
  stage: LaunchStage,
  key: "launches_email_open_rate" | "launches_email_click_rate",
): number[] {
  const found: number[] = [];
  for (let n = 1; n <= MAX_EMAILS; n += 1) {
    const rate = detail.values.get(key, { stageId: stage.id, email: n });
    if (rate !== null) found.push(rate);
  }
  return found;
}

export function stageFigures(detail: LaunchDetail): StageFigures[] {
  return detail.stages.map((stage) => {
    const signUps = detail.values.get("launches_sign_ups", { stageId: stage.id });
    const byDay = attendeesByDay(detail, stage);
    const dayOne = dayOneAttendees(detail, stage);
    const liveAtEndOfPitch = detail.values.get("launches_live_at_end_of_pitch", {
      stageId: stage.id,
    });
    const liveAtStart = detail.values.get("launches_live_at_start", { stageId: stage.id });

    return {
      stage,
      signUps,
      attendeesByDay: byDay,
      showUpRate: launchFormulas.showUpRate(dayOne, signUps),
      dayDropOff: byDay.map((d) => launchFormulas.dayDropOff(d, dayOne)),
      // **Against the room at the start of the session**, which is what
      // §6.2's table said all along and what Nina confirmed on
      // 28 October. It had been measured against the audience when the
      // pitch began — Dom's call on 8 October, made because
      // `launches_live_at_pitch` otherwise fed nothing at all. It still
      // feeds nothing; a figure collected and unused is the smaller
      // problem, and the bigger one was that the two readings give very
      // different numbers and she is the one who quotes them.
      liveAtEndOfPitch,
      liveAtStart,
      pitchRetention: launchFormulas.pitchRetention(liveAtEndOfPitch, liveAtStart),
      percentOfSignUpGoal: launchFormulas.percentOfSignUpGoal(signUps, stage.sign_up_goal),
      averageOpenRate: launchFormulas.averageRatePerStage(
        emailRates(detail, stage, "launches_email_open_rate"),
      ),
      averageClickRate: launchFormulas.averageRatePerStage(
        emailRates(detail, stage, "launches_email_click_rate"),
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Nina's final spec, 19 November. Everything below is one of her items.
// ---------------------------------------------------------------------------

/**
 * One of the client's own sources, with what it was asked for and what
 * it did (her item 6).
 *
 * Sign-ups against a target, and the sales those sign-ups turned into.
 * The conversion is this source's own — sales ÷ sign-ups FROM THIS
 * SOURCE — which is the question the panel exists to answer: ads and the
 * email list can bring the same number of people and not the same
 * number of buyers.
 */
export interface SourceFigures {
  source: LaunchSource;
  signUps: number | null;
  sales: number | null;
  percentOfTarget: number | null;
  /** Sales ÷ sign-ups, for this source alone. */
  conversion: number | null;
  /** This source's share of every sign-up placed against a source. */
  shareOfSignUps: number | null;
}

export function sourceFigures(detail: LaunchDetail): SourceFigures[] {
  const rows = detail.sources.map((source) => ({
    source,
    signUps: detail.values.get("launches_sign_ups_from_source", { sourceId: source.id }),
    sales: detail.values.get("launches_sales_from_source", { sourceId: source.id }),
  }));

  // **The share is of what was PLACED, not of the launch's total.** A
  // launch with 400 sign-ups and 300 of them placed against a source
  // would otherwise show four shares adding up to 75%, which reads as
  // arithmetic going wrong rather than as a quarter being unaccounted
  // for. The panel says how many were placed underneath.
  const placed = sumOf(rows.map((r) => r.signUps));

  return rows.map((row) => ({
    ...row,
    percentOfTarget: launchFormulas.percentOfSourceTarget(
      row.signUps,
      row.source.sign_up_target,
    ),
    conversion: launchFormulas.conversionRate(row.sales, row.signUps),
    shareOfSignUps:
      placed === null || placed === 0 || row.signUps === null
        ? null
        : (row.signUps / placed) * 100,
  }));
}

/** Sign-ups placed against a source, and sales, for the panel's footer. */
export function sourceTotals(rows: SourceFigures[]): {
  signUps: number | null;
  sales: number | null;
  target: number | null;
} {
  return {
    signUps: sumOf(rows.map((r) => r.signUps)),
    sales: sumOf(rows.map((r) => r.sales)),
    target: sumOf(rows.map((r) => r.source.sign_up_target)),
  };
}

/**
 * What the ads did (her item 8).
 *
 * Everything here was already being typed in and shown on no screen at
 * all — `launches_ad_spend`, `_ad_leads` and `_ad_sales` have been in
 * the entry form since 30 September and appeared only on the team's
 * Compare page. The budget, the target and the clicks are new, and they
 * are what turn three orphan figures into a panel that answers "is this
 * working and how much is left".
 */
export interface AdFigures {
  budget: number | null;
  targetCostPerSignUp: number | null;
  spent: number | null;
  left: number | null;
  signUpsNeeded: number | null;
  signUps: number | null;
  sales: number | null;
  clicks: number | null;
  costPerSignUp: number | null;
  costPerClick: number | null;
  /** Whether anything at all has been said about the ads. */
  any: boolean;
}

export function adFigures(detail: LaunchDetail): AdFigures {
  const at = (key: string) => detail.values.get(key);
  const budget = at("launches_ad_budget");
  const spent = at("launches_ad_spend");
  const clicks = at("launches_ad_clicks");
  const signUps = at("launches_ad_leads");
  const target = at("launches_target_cost_per_sign_up");

  const figures = {
    budget,
    targetCostPerSignUp: target,
    spent,
    clicks,
    signUps,
    sales: at("launches_ad_sales"),
    left: launchFormulas.budgetLeft(budget, spent),
    signUpsNeeded: launchFormulas.adSignUpsNeeded(budget, target),
    // **Against the ads' OWN sign-ups**, not the launch's. The metric is
    // called `launches_cost_per_sign_up` and its formula says "ad spend ÷
    // sign-ups", which was written when the only sign-up figure was the
    // launch's — and dividing one channel's spend by every channel's
    // sign-ups flatters the ads by however well the email list did.
    costPerSignUp: launchFormulas.costPerSignUp(spent, signUps),
    costPerClick: launchFormulas.costPerClick(spent, clicks),
  };

  return {
    ...figures,
    any: [budget, spent, clicks, signUps, target, figures.sales].some((v) => v !== null),
  };
}

/** The DM and call pipeline, which has also never been on a screen. */
export interface PipelineFigures {
  dmsSent: number | null;
  dmReplies: number | null;
  replyRate: number | null;
  discoveryCalls: number | null;
  callsBooked: number | null;
  callsClosed: number | null;
  callToCloseRate: number | null;
  notInterested: number | null;
  any: boolean;
}

export function pipelineFigures(detail: LaunchDetail): PipelineFigures {
  const at = (key: string) => detail.values.get(key);
  const dmsSent = at("launches_dms_sent");
  const dmReplies = at("launches_dm_replies");
  const callsBooked = at("launches_sales_calls_booked");
  const callsClosed = at("launches_sales_calls_closed");
  const discoveryCalls = at("launches_discovery_calls");
  const notInterested = at("launches_not_interested");

  return {
    dmsSent,
    dmReplies,
    discoveryCalls,
    callsBooked,
    callsClosed,
    notInterested,
    replyRate: launchFormulas.replyRate(dmReplies, dmsSent),
    callToCloseRate: launchFormulas.callToCloseRate(callsClosed, callsBooked),
    any: [dmsSent, dmReplies, discoveryCalls, callsBooked, callsClosed, notInterested].some(
      (v) => v !== null,
    ),
  };
}

/**
 * Every day of the launch, and the sign-ups counted on it (her item 7).
 *
 * **The span is the launch's own dates**, first thing any stage carries
 * to the last — the same pair the lock and the date range on the card
 * read, so a launch cannot be one length in three places. A launch with
 * no dates has no day grid at all rather than an arbitrary thirty boxes.
 *
 * Capped, because a date typed with the wrong year would otherwise ask
 * the entry screen to draw several thousand boxes. Ninety days is longer
 * than any launch in the brief and short enough to render.
 */
export const MAX_LAUNCH_DAYS = 90;

export interface LaunchDay {
  /** 1-based, which is how the figure is keyed. */
  day: number;
  /** ISO, so nothing builds a Date and no zone can shift one. */
  date: string;
  signUps: number | null;
  /** Sign-ups to the end of this day. Null until the first figure. */
  runningTotal: number | null;
}

export function dayGrid(detail: LaunchDetail): LaunchDay[] {
  const first = launchFirstDay(detail.stages);
  const last = launchLastDay(detail.stages);
  if (!first || !last) return [];

  const start = Date.parse(`${first}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const days = Math.min(
    Math.round((end - start) / 86_400_000) + 1,
    MAX_LAUNCH_DAYS,
  );

  let running: number | null = null;
  return Array.from({ length: days }, (_unused, i) => {
    const signUps = detail.values.get("launches_sign_ups", { day: i + 1 });
    if (signUps !== null) running = (running ?? 0) + signUps;
    return {
      day: i + 1,
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      signUps,
      runningTotal: running,
    };
  });
}

/**
 * One email, its words and its figures, for the table on the report.
 *
 * Driven by `report_launch_emails` rather than by the figures: an email
 * that went out is a row whether anybody has typed its open rate yet or
 * not, and a table built from the figures would make an unmeasured email
 * invisible.
 */
export interface EmailRow {
  email: LaunchEmail;
  stageName: string;
  sentTo: number | null;
  openRate: number | null;
  clickRate: number | null;
  uniqueClicks: number | null;
  clickedNoSignUp: number | null;
}

export function emailRows(detail: LaunchDetail): EmailRow[] {
  const stageName = new Map(detail.stages.map((s) => [s.id, s.name]));
  const at = (key: string, email: LaunchEmail) =>
    detail.values.get(key, { stageId: email.stage_id, email: email.number });

  return detail.emails
    .map((email) => ({
      email,
      stageName: stageName.get(email.stage_id) ?? "",
      sentTo: at("launches_email_list_size_sent_to", email),
      openRate: at("launches_email_open_rate", email),
      clickRate: at("launches_email_click_rate", email),
      uniqueClicks: at("launches_email_unique_clicks", email),
      clickedNoSignUp: at("launches_email_clicked_no_sign_up", email),
    }))
    // **Date first where there is one.** "Across the launch" is what her
    // charts are of, and the launch's order is the order they went out
    // in — which is not the stage order when a promo email for stage
    // three went before the last email of stage two.
    .sort((a, b) => {
      const left = a.email.sent_on ?? "";
      const right = b.email.sent_on ?? "";
      if (left && right && left !== right) return left < right ? -1 : 1;
      if (left !== right) return left ? -1 : 1;
      if (a.stageName !== b.stageName) return a.stageName < b.stageName ? -1 : 1;
      return a.email.number - b.email.number;
    });
}

/**
 * The planner, and whether the launch is keeping to it (her item 5).
 *
 * **The show-up step only where the launch has a live event.** Her
 * words, and the reason is that a waitlist-and-open-cart launch has no
 * room for anybody to turn up to, so "expected in the room" would be a
 * number about nothing.
 *
 * The check compares the launch's real conversion against the rate the
 * plan assumed. Both are sales ÷ sign-ups to the selling stage, so they
 * are the same measurement and not two that happen to share a name.
 */
export interface PlannerFigures {
  signUpsNeeded: number | null;
  liveAttendeesNeeded: number | null;
  hasLiveEvent: boolean;
  salesGoal: number | null;
  assumedConversion: number | null;
  assumedShowUp: number | null;
  actualConversion: number | null;
  actualShowUp: number | null;
  conversionCheck: "on-track" | "behind" | null;
  showUpCheck: "on-track" | "behind" | null;
}

export function plannerFigures(detail: LaunchDetail): PlannerFigures {
  const summary = launchSummary(detail);
  const stages = stageFigures(detail);
  const live = hasLiveEvent(detail.stages);

  const { signUpsNeeded, liveAttendeesNeeded } = launchFormulas.planner({
    salesGoal: detail.launch.goal_good,
    conversionRatePercent: detail.launch.planner_conversion_rate,
    showUpRatePercent: detail.launch.planner_show_up_rate,
  });

  // The selling stage's show-up rate, which is the one the plan's
  // show-up rate is about — not the challenge's, which is usually the
  // better of the two and would say the plan is being beaten when the
  // room that matters is half empty.
  const selling =
    stages.find((st) => st.stage.is_main_selling_stage) ??
    stages.filter((st) => st.showUpRate !== null).at(-1) ??
    null;

  return {
    signUpsNeeded,
    liveAttendeesNeeded: live ? liveAttendeesNeeded : null,
    hasLiveEvent: live,
    salesGoal: detail.launch.goal_good,
    assumedConversion: detail.launch.planner_conversion_rate,
    assumedShowUp: live ? detail.launch.planner_show_up_rate : null,
    actualConversion: summary.conversionRate,
    actualShowUp: live ? (selling?.showUpRate ?? null) : null,
    conversionCheck: launchFormulas.conversionCheck(
      summary.conversionRate,
      detail.launch.planner_conversion_rate,
    ),
    showUpCheck: live
      ? launchFormulas.conversionCheck(
          selling?.showUpRate ?? null,
          detail.launch.planner_show_up_rate,
        )
      : null,
  };
}
