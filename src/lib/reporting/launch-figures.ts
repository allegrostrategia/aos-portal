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
    conversionRate: launchFormulas.conversionRate(totalSales, mainSignUps),
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
