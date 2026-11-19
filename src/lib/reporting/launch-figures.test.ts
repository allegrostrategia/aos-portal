import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adFigures,
  dayGrid,
  emailRows,
  launchSummary,
  plannerFigures,
  sourceFigures,
  stageFigures,
} from "./launch-figures.ts";
import type {
  LaunchDetail,
  LaunchEmail,
  LaunchPrice,
  LaunchSource,
  LaunchStage,
} from "./launch-queries.ts";

/**
 * Which figure goes into which formula (§6).
 *
 * `formulas.ts` is tested on its arithmetic; this module is tested on its
 * choices, and the choices are where Nina's review landed. Two of her
 * answers changed a number she quotes out loud:
 *
 *   · conversion is sales ÷ **sign-ups** to the selling stage, not its
 *     attendees (decision 20);
 *   · pitch retention is end-of-pitch ÷ **live at start of the session**,
 *     not live at the start of the pitch (decision 19).
 *
 * Both read the same arithmetic as before, from a different box — which
 * is precisely the kind of change no formula test can see.
 *
 * `LaunchDetail` is duck-typed rather than built from `launch-queries.ts`,
 * which is `server-only` and would refuse to load here. The only part
 * this module touches is `values.get`.
 */

type At = {
  stageId?: string | null;
  priceId?: string | null;
  sourceId?: string | null;
  day?: number | null;
  email?: number | null;
};

function detailFrom({
  stages = [],
  prices = [],
  sources = [],
  emails = [],
  launch = {},
  values = {},
}: {
  stages?: Partial<LaunchStage>[];
  prices?: Partial<LaunchPrice>[];
  sources?: Partial<LaunchSource>[];
  emails?: Partial<LaunchEmail>[];
  launch?: Partial<LaunchDetail["launch"]>;
  /** `metric|stage|price|source|day|email`, the shape LaunchValues keys on. */
  values?: Record<string, number | null>;
}): LaunchDetail {
  const key = (metric: string, at: At) =>
    [
      metric,
      at.stageId ?? "",
      at.priceId ?? "",
      at.sourceId ?? "",
      at.day ?? "",
      at.email ?? "",
    ].join("|");

  return {
    launch: {
      id: "launch-1",
      goal_good: null,
      goal_better: null,
      goal_best: null,
      sign_up_goal_good: null,
      sign_up_goal_better: null,
      sign_up_goal_best: null,
      lead_tracker_url: null,
      planner_show_up_rate: null,
      planner_conversion_rate: null,
      ...launch,
    } as LaunchDetail["launch"],
    stages: stages.map((s, i) => ({
      id: `stage-${i + 1}`,
      name: `Stage ${i + 1}`,
      position: i + 1,
      live_days: 1,
      sign_up_goal: null,
      is_main_selling_stage: false,
      ...s,
    })) as LaunchStage[],
    prices: prices.map((p, i) => ({
      id: `price-${i + 1}`,
      name: `Option ${i + 1}`,
      price: 0,
      plan: "full",
      instalments: null,
      instalment_amount: null,
      is_main: false,
      ...p,
    })) as LaunchPrice[],
    sources: sources.map((src, i) => ({
      id: `source-${i + 1}`,
      launch_id: "launch-1",
      name: `Source ${i + 1}`,
      position: i + 1,
      sign_up_target: null,
      ...src,
    })) as LaunchSource[],
    emails: emails.map((e, i) => ({
      id: `email-${i + 1}`,
      launch_id: "launch-1",
      stage_id: "stage-1",
      number: i + 1,
      sent_on: null,
      subject: null,
      is_resend: false,
      ...e,
    })) as LaunchEmail[],
    values: {
      get: (metric: string, at: At = {}) => values[key(metric, at)] ?? null,
    } as LaunchDetail["values"],
  };
}

test("conversion is sales divided by the selling stage's sign-ups", () => {
  const detail = detailFrom({
    stages: [
      { id: "challenge", name: "Challenge" },
      { id: "masterclass", name: "Masterclass", is_main_selling_stage: true },
    ],
    prices: [{ id: "full", price: 500, is_main: true }],
    values: {
      "launches_sales_per_price_option||full|||": 30,
      // 600 signed up to the masterclass; 200 of them turned up.
      "launches_sign_ups|masterclass||||": 600,
      "launches_live_attendees|masterclass|||1|": 200,
      // The challenge is bigger and must not reach the sum at all.
      "launches_sign_ups|challenge||||": 2000,
      "launches_live_attendees|challenge|||1|": 900,
    },
  });

  // 30 ÷ 600 = 5%. Against attendees it would have read 15%, and against
  // every stage's attendees 2.7%.
  assert.equal(launchSummary(detail).conversionRate, 5);
});

test("no selling stage means no conversion rate, not a guess", () => {
  const detail = detailFrom({
    stages: [{ id: "masterclass", name: "Masterclass" }],
    prices: [{ id: "full", price: 500, is_main: true }],
    values: {
      "launches_sales_per_price_option||full|||": 30,
      "launches_sign_ups|masterclass||||": 600,
    },
  });

  assert.equal(launchSummary(detail).conversionRate, null);
});

test("pitch retention is measured against the room at the start of the session", () => {
  const [stage] = stageFigures(
    detailFrom({
      stages: [{ id: "masterclass", name: "Masterclass" }],
      values: {
        "launches_live_at_start|masterclass||||": 68,
        // Deliberately different, and deliberately not the denominator.
        "launches_live_at_pitch|masterclass||||": 50,
        "launches_live_at_end_of_pitch|masterclass||||": 34,
      },
    }),
  );

  // 34 of 68 = 50%. Against live-at-pitch it would have read 68%.
  assert.equal(stage.pitchRetention, 50);
  assert.equal(stage.liveAtEndOfPitch, 34);
  assert.equal(stage.liveAtStart, 68);
});

test("the end-of-pitch count is reported even when the share cannot be", () => {
  const [stage] = stageFigures(
    detailFrom({
      stages: [{ id: "masterclass", name: "Masterclass" }],
      values: { "launches_live_at_end_of_pitch|masterclass||||": 34 },
    }),
  );

  // Nobody entered the room at the start, so there is no share to show —
  // but 34 were still there, and that is worth saying on its own.
  assert.equal(stage.liveAtEndOfPitch, 34);
  assert.equal(stage.liveAtStart, null);
  assert.equal(stage.pitchRetention, null);
});

test("show-up rate still reads day one against sign-ups", () => {
  const [stage] = stageFigures(
    detailFrom({
      stages: [{ id: "masterclass", name: "Masterclass", live_days: 2 }],
      values: {
        "launches_sign_ups|masterclass||||": 200,
        "launches_live_attendees|masterclass|||1|": 100,
        "launches_live_attendees|masterclass|||2|": 60,
      },
    }),
  );

  // Unchanged by decision 20: the two figures answer different questions
  // and conversion moving must not move this one.
  assert.equal(stage.showUpRate, 50);
  assert.deepEqual(stage.attendeesByDay, [100, 60]);
});

// ---------------------------------------------------------------------------
// Nina's final spec, 19 November. Again: the choices, not the arithmetic.
// ---------------------------------------------------------------------------

test("a launch's sign-ups are never its stages added up", () => {
  /**
   * **The bug this test exists for.** The stages of a launch are
   * sequential, so the 900 who joined the masterclass had already signed
   * up to the challenge — adding them gives 2,177 for a launch 1,277
   * people entered. The first build did add them, and the goal panel
   * then disagreed with the running-total chart directly above it.
   */
  const detail = detailFrom({
    stages: [
      { id: "challenge", name: "Challenge" },
      { id: "masterclass", name: "Masterclass", is_main_selling_stage: true },
    ],
    values: {
      "launches_sign_ups|challenge||||": 1277,
      "launches_sign_ups|masterclass||||": 900,
    },
  });

  // The first stage with sign-ups: the top of the funnel.
  assert.equal(launchSummary(detail).totalSignUps, 1277);
  assert.notEqual(launchSummary(detail).totalSignUps, 2177);
});

test("where the days are typed, they are the launch's sign-ups", () => {
  // The client counted them day by day, which is the launch's own figure
  // entered as exactly that — and it is what the chart beside the goals
  // draws, so the two cannot be allowed to differ.
  const detail = detailFrom({
    stages: [
      {
        id: "challenge",
        promo_start: "2026-09-01",
        promo_end: "2026-09-03",
        live_start: null,
        live_end: null,
      },
    ],
    values: {
      "launches_sign_ups|challenge||||": 1277,
      "launches_sign_ups||||1|": 40,
      "launches_sign_ups||||2|": 60,
      "launches_sign_ups||||3|": 25,
    },
  });
  assert.equal(launchSummary(detail).totalSignUps, 125);
});

test("MRR counts the monthly options at one month, and nothing else", () => {
  const detail = detailFrom({
    prices: [
      { id: "full", name: "Pay in full", price: 500, plan: "full" },
      {
        id: "monthly",
        name: "Monthly, 3 months",
        price: 600,
        plan: "monthly",
        instalments: 3,
        instalment_amount: 200,
      },
    ],
    values: {
      "launches_sales_per_price_option||full|||": 22,
      "launches_sales_per_price_option||monthly|||": 8,
    },
  });
  const summary = launchSummary(detail);

  // 8 x £200 a month. **Not** 8 x £600, which is the contract value and
  // what total revenue counts; and not a twelfth of anything.
  assert.equal(summary.mrr, 1600);
  // 22 x 500 + 8 x 600 — the full value of both, unchanged.
  assert.equal(summary.totalRevenue, 15_800);
});

test("a launch with nothing monthly has no MRR, rather than zero", () => {
  const detail = detailFrom({
    prices: [{ id: "full", price: 500, plan: "full" }],
    values: { "launches_sales_per_price_option||full|||": 10 },
  });
  // §4's rule: "no recurring revenue" and "nobody has said" are
  // different, and a £0 card would say the first about a launch that
  // never sold anything monthly.
  assert.equal(launchSummary(detail).mrr, null);
});

test("a source's share is of what was placed, not of the launch", () => {
  const detail = detailFrom({
    sources: [
      { id: "email", name: "Email list", sign_up_target: 100 },
      { id: "ads", name: "Meta ads", sign_up_target: 200 },
    ],
    values: {
      "launches_sign_ups_from_source|||email||": 120,
      "launches_sales_from_source|||email||": 12,
      "launches_sign_ups_from_source|||ads||": 80,
      "launches_sales_from_source|||ads||": 4,
    },
  });
  const [email, ads] = sourceFigures(detail);

  assert.equal(email.percentOfTarget, 120);
  assert.equal(ads.percentOfTarget, 40);
  // 120 of the 200 placed. **Not of the launch's own sign-ups**: a
  // launch with 400 sign-ups and 200 placed would otherwise show shares
  // adding to 50%, which reads as the arithmetic going wrong rather than
  // as half being unaccounted for.
  assert.equal(email.shareOfSignUps, 60);
  assert.equal(ads.shareOfSignUps, 40);
  // Each source's own conversion: ads bring two thirds of email's people
  // and a third of its buyers, which is the comparison the panel is for.
  assert.equal(email.conversion, 10);
  assert.equal(ads.conversion, 5);
});

test("the day grid is the launch's own span, and the total runs", () => {
  const detail = detailFrom({
    stages: [
      {
        id: "s1",
        promo_start: "2026-09-01",
        promo_end: "2026-09-02",
        live_start: "2026-09-04",
        live_end: "2026-09-05",
      },
    ],
    values: {
      "launches_sign_ups||||1|": 10,
      // Day 2 untyped: a gap, never a zero — the running total holds.
      "launches_sign_ups||||3|": 5,
      "launches_sign_ups||||5|": 7,
    },
  });
  const days = dayGrid(detail);

  assert.equal(days.length, 5);
  assert.equal(days[0].date, "2026-09-01");
  assert.equal(days[4].date, "2026-09-05");
  assert.deepEqual(
    days.map((d) => d.runningTotal),
    [10, 10, 15, 15, 22],
  );
});

test("a launch with no dates has no day grid, rather than a guessed one", () => {
  const detail = detailFrom({ stages: [{ id: "s1" }] });
  assert.deepEqual(dayGrid(detail), []);
});

test("the email table is built from the rows, in the order they went", () => {
  const detail = detailFrom({
    stages: [
      { id: "promo", name: "Promo" },
      { id: "cart", name: "Open cart" },
    ],
    emails: [
      { id: "e1", stage_id: "cart", number: 1, sent_on: "2026-09-20", subject: "Open" },
      { id: "e2", stage_id: "promo", number: 1, sent_on: "2026-09-01", subject: "Monday" },
      // A resend of e2: its own row, its own number, and no figures yet.
      { id: "e3", stage_id: "promo", number: 2, sent_on: "2026-09-02", subject: "Monday", is_resend: true },
    ],
    values: {
      "launches_email_open_rate|promo||||1": 42,
      "launches_email_clicked_no_sign_up|promo||||1": 288,
    },
  });
  const rows = emailRows(detail);

  // Date order across the launch, which is not the stage order.
  assert.deepEqual(
    rows.map((r) => r.email.id),
    ["e2", "e3", "e1"],
  );
  assert.equal(rows[0].openRate, 42);
  assert.equal(rows[0].clickedNoSignUp, 288);
  assert.equal(rows[0].stageName, "Promo");
  // An email nobody has measured is still a row, because it still went.
  assert.equal(rows[1].openRate, null);
  assert.equal(rows[1].email.is_resend, true);
});

test("a launch with no live event gets no show-up step", () => {
  // Her item 5: the show-up rate belongs to a launch that has a room.
  const detail = detailFrom({
    stages: [
      { id: "wait", stage_type: "waitlist" },
      { id: "cart", stage_type: "open_cart", is_main_selling_stage: true },
    ],
    launch: { goal_good: 30, planner_conversion_rate: 5, planner_show_up_rate: 47 },
    prices: [{ id: "full", price: 500 }],
    values: {
      "launches_sales_per_price_option||full|||": 30,
      "launches_sign_ups|cart||||": 400,
    },
  });
  const planner = plannerFigures(detail);

  assert.equal(planner.hasLiveEvent, false);
  assert.equal(planner.signUpsNeeded, 600);
  // No room, so no number about one — and no check on it either.
  assert.equal(planner.liveAttendeesNeeded, null);
  assert.equal(planner.assumedShowUp, null);
  assert.equal(planner.showUpCheck, null);
  // 30 ÷ 400 is 7.5% against the 5% assumed.
  assert.equal(planner.conversionCheck, "on-track");
});

test("the check reads the selling stage's show-up, not the challenge's", () => {
  const detail = detailFrom({
    stages: [
      { id: "challenge", stage_type: "challenge" },
      { id: "class", stage_type: "masterclass", is_main_selling_stage: true },
    ],
    launch: { goal_good: 30, planner_conversion_rate: 5, planner_show_up_rate: 60 },
    values: {
      // The challenge filled the room; the masterclass did not.
      "launches_sign_ups|challenge||||": 1000,
      "launches_live_attendees|challenge|||1|": 800,
      "launches_sign_ups|class||||": 500,
      "launches_live_attendees|class|||1|": 200,
    },
  });
  const planner = plannerFigures(detail);

  // 200 of 500 is 40%, which is behind the 60% planned. The challenge's
  // 80% would have said "on track" about a room that was two thirds
  // empty.
  assert.equal(planner.actualShowUp, 40);
  assert.equal(planner.showUpCheck, "behind");
});

test("the ads' cost per sign-up is the ads' own, not the launch's", () => {
  const detail = detailFrom({
    stages: [{ id: "s1", is_main_selling_stage: true }],
    values: {
      "launches_ad_budget|||||": 5000,
      "launches_ad_spend|||||": 2400,
      "launches_ad_clicks|||||": 3100,
      "launches_ad_leads|||||": 420,
      "launches_target_cost_per_sign_up|||||": 9,
      // The launch's own sign-ups, which must not reach this sum.
      "launches_sign_ups|s1||||": 1277,
    },
  });
  const ads = adFigures(detail);

  assert.equal(ads.left, 2600);
  // £2,400 over the ADS' 420 sign-ups. Over the launch's 1,277 it would
  // read £1.88, which flatters the ads by however well the email list
  // did.
  assert.equal(Math.round((ads.costPerSignUp as number) * 100) / 100, 5.71);
  assert.equal(Math.round((ads.costPerClick as number) * 100) / 100, 0.77);
  // £5,000 at £9 a sign-up, rounded up: you cannot buy 555.5 of them.
  assert.equal(ads.signUpsNeeded, 556);
});
