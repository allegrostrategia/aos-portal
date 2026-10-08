import { launch as launchFormulas, type LaunchPriceOption } from "./formulas.ts";
import type { LaunchDetail, LaunchPrice, LaunchStage } from "./launch-queries.ts";

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
  /** §6.4: the sources must add up, and the screen says so when they do not. */
  sourcesAddUp: boolean;
  salesBySource: { label: string; value: number | null }[];
}

export interface StageFigures {
  stage: LaunchStage;
  signUps: number | null;
  /** One per live day, in order, so the drop-off reads left to right. */
  attendeesByDay: (number | null)[];
  showUpRate: number | null;
  dayDropOff: (number | null)[];
  pitchRetention: number | null;
  percentOfSignUpGoal: number | null;
  averageOpenRate: number | null;
  averageClickRate: number | null;
}

/** The price options as the formulas want them. */
function priceOptions(detail: LaunchDetail): LaunchPriceOption[] {
  return detail.prices.map((p: LaunchPrice) => ({
    name: p.name,
    price: p.price,
    sales: detail.values.get("launches_sales_per_price_option", { priceId: p.id }),
    isMain: p.is_main,
  }));
}

const SOURCES = [
  ["Stage", "launches_sales_from_stage"],
  ["Email", "launches_sales_from_email"],
  ["DM", "launches_sales_from_dm"],
  ["Ads", "launches_sales_from_ads"],
  ["Referral", "launches_sales_from_referral"],
  ["Unknown", "launches_sales_from_unknown"],
] as const;

export function launchSummary(detail: LaunchDetail): LaunchSummary {
  const options = priceOptions(detail);
  const totalSales = launchFormulas.totalSales(options);
  const totalRevenue = launchFormulas.totalRevenue(options);
  const cashCollected = detail.values.get("launches_cash_collected_to_date");

  // §6.4's conversion rate is against the MAIN SELLING STAGE's live
  // attendees, not every attendee of every stage. A launch with a waitlist
  // and a challenge before the masterclass would otherwise read as
  // converting a fraction of a far larger number.
  const mainStage = detail.stages.find((s) => s.is_main_selling_stage) ?? null;
  const mainAttendees = mainStage
    ? totalAttendees(detail, mainStage)
    : null;

  const salesBySource = SOURCES.map(([label, key]) => ({
    label,
    value: detail.values.get(key),
  }));

  return {
    totalSales,
    totalRevenue,
    cashCollected,
    revenueStillToCollect: launchFormulas.revenueStillToCollect(totalRevenue, cashCollected),
    averageOrderValue: launchFormulas.averageOrderValue(totalRevenue, totalSales),
    percentOfGood: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_good),
    percentOfBetter: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_better),
    percentOfBest: launchFormulas.percentOfGoal(totalSales, detail.launch.goal_best),
    conversionRate: launchFormulas.conversionRate(totalSales, mainAttendees),
    sourcesAddUp: launchFormulas.sourcesReconcile(
      salesBySource.map((s) => s.value),
      totalSales,
    ),
    salesBySource,
  };
}

/** Day one's attendees, which is what every attendance figure keys off. */
function dayOneAttendees(detail: LaunchDetail, stage: LaunchStage): number | null {
  return detail.values.get("launches_live_attendees", { stageId: stage.id, day: 1 });
}

/** Everyone who turned up across the stage's live days. */
function totalAttendees(detail: LaunchDetail, stage: LaunchStage): number | null {
  const days = attendeesByDay(detail, stage);
  const present = days.filter((d): d is number => d !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
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

    return {
      stage,
      signUps,
      attendeesByDay: byDay,
      showUpRate: launchFormulas.showUpRate(dayOne, signUps),
      dayDropOff: byDay.map((d) => launchFormulas.dayDropOff(d, dayOne)),
      // **Against the audience when the pitch began**, not the audience
      // when the session began. §6.2's table says "live at start", which
      // would leave `launches_live_at_pitch` feeding nothing at all — and
      // a figure the brief asks to be collected and then never uses is
      // better read as the one it meant. Dom's call, 8 October; on Nina's
      // list to confirm, since it changes a number she will quote.
      pitchRetention: launchFormulas.pitchRetention(
        detail.values.get("launches_live_at_end_of_pitch", { stageId: stage.id }),
        detail.values.get("launches_live_at_pitch", { stageId: stage.id }),
      ),
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
