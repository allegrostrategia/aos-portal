import assert from "node:assert/strict";
import { test } from "node:test";

import { launchSummary, stageFigures } from "./launch-figures.ts";
import type { LaunchDetail, LaunchPrice, LaunchStage } from "./launch-queries.ts";

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

type At = { stageId?: string | null; priceId?: string | null; day?: number | null; email?: number | null };

function detailFrom({
  stages = [],
  prices = [],
  values = {},
}: {
  stages?: Partial<LaunchStage>[];
  prices?: Partial<LaunchPrice>[];
  /** `metric|stage|price|day|email`, the shape LaunchValues keys on. */
  values?: Record<string, number | null>;
}): LaunchDetail {
  const key = (metric: string, at: At) =>
    [metric, at.stageId ?? "", at.priceId ?? "", at.day ?? "", at.email ?? ""].join("|");

  return {
    launch: {
      id: "launch-1",
      goal_good: null,
      goal_better: null,
      goal_best: null,
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
      is_main: false,
      ...p,
    })) as LaunchPrice[],
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
      "launches_sales_per_price_option||full||": 30,
      // 600 signed up to the masterclass; 200 of them turned up.
      "launches_sign_ups|masterclass|||": 600,
      "launches_live_attendees|masterclass||1|": 200,
      // The challenge is bigger and must not reach the sum at all.
      "launches_sign_ups|challenge|||": 2000,
      "launches_live_attendees|challenge||1|": 900,
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
      "launches_sales_per_price_option||full||": 30,
      "launches_sign_ups|masterclass|||": 600,
    },
  });

  assert.equal(launchSummary(detail).conversionRate, null);
});

test("pitch retention is measured against the room at the start of the session", () => {
  const [stage] = stageFigures(
    detailFrom({
      stages: [{ id: "masterclass", name: "Masterclass" }],
      values: {
        "launches_live_at_start|masterclass|||": 68,
        // Deliberately different, and deliberately not the denominator.
        "launches_live_at_pitch|masterclass|||": 50,
        "launches_live_at_end_of_pitch|masterclass|||": 34,
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
      values: { "launches_live_at_end_of_pitch|masterclass|||": 34 },
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
        "launches_sign_ups|masterclass|||": 200,
        "launches_live_attendees|masterclass||1|": 100,
        "launches_live_attendees|masterclass||2|": 60,
      },
    }),
  );

  // Unchanged by decision 20: the two figures answer different questions
  // and conversion moving must not move this one.
  assert.equal(stage.showUpRate, 50);
  assert.deepEqual(stage.attendeesByDay, [100, 60]);
});
