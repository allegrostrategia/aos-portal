import type { LaunchStageType } from "./launch-queries.ts";

/**
 * What a stage is called, and what its count is called (Nina's item 1,
 * 19 November).
 *
 * **Her "launch type ticks" are this list**, value for value: challenge,
 * masterclass, webinar, workshop, waitlist, open cart, other. It is
 * `report_launch_stage_type`, which has held exactly those seven since
 * 30 September — so the ticks needed no new column, and a second list at
 * launch level would have been the same list twice with no way to stop
 * the two disagreeing.
 *
 * What was missing is the half she actually asked for: **the type has to
 * SET something.** Until today the entry screen said "Sign-ups" above
 * every box of every stage of every launch, and the stage's name was
 * free text somebody retyped each time. Now the type names the stage and
 * labels its count, in one place, so the launch report and the entry
 * screen cannot word the same figure differently.
 *
 * Two of the seven get a plain "Sign-ups" rather than a prefixed one,
 * and that is a judgement rather than an oversight: **nobody signs up to
 * an open cart** — it is the selling window, and "Open cart sign-ups"
 * would name a thing that does not happen — and "other" has nothing to
 * borrow a word from.
 */

const STAGES: Record<LaunchStageType, { name: string; signUps: string }> = {
  challenge: { name: "Challenge", signUps: "Challenge sign-ups" },
  masterclass: { name: "Masterclass", signUps: "Masterclass sign-ups" },
  webinar: { name: "Webinar", signUps: "Webinar sign-ups" },
  workshop: { name: "Workshop", signUps: "Workshop sign-ups" },
  waitlist: { name: "Waitlist", signUps: "Waitlist sign-ups" },
  open_cart: { name: "Open cart", signUps: "Sign-ups" },
  other: { name: "Stage", signUps: "Sign-ups" },
};

/** The tick's own words, for a dropdown. */
export const STAGE_TYPE_LABELS: Record<LaunchStageType, string> = {
  challenge: "Challenge",
  masterclass: "Masterclass",
  webinar: "Webinar",
  workshop: "Workshop",
  waitlist: "Waitlist",
  open_cart: "Open cart",
  other: "Other",
};

export const STAGE_TYPES = Object.keys(STAGES) as LaunchStageType[];

/**
 * What to call this stage's sign-up count: "Challenge sign-ups".
 *
 * Takes the type rather than the stage, so the entry form (which has a
 * type before it has a row) and the report (which has a row) ask the
 * same question.
 */
export function signUpLabel(type: LaunchStageType): string {
  return STAGES[type].signUps;
}

/**
 * The name a stage of this type starts with.
 *
 * Offered as a placeholder, never written over something typed: a stage
 * called "Day 1-3 bootcamp" is a better name than "Challenge" and the
 * type should not take it away.
 */
export function defaultStageName(type: LaunchStageType): string {
  return STAGES[type].name;
}

/** The type's own label, for a badge beside a name somebody changed. */
export function stageTypeLabel(type: LaunchStageType): string {
  return STAGE_TYPE_LABELS[type];
}

/**
 * Does this launch have a live event at all?
 *
 * Her item 5: the planner carries a show-up rate "where the launch has a
 * live event". Five of the seven types are something people turn up to;
 * a waitlist and an open cart are not, and neither is "other" — so a
 * launch made only of those gets no show-up step rather than a step
 * measured against nothing.
 */
const LIVE_EVENTS = new Set<LaunchStageType>([
  "challenge",
  "masterclass",
  "webinar",
  "workshop",
]);

export function hasLiveEvent(stages: { stage_type: LaunchStageType }[]): boolean {
  return stages.some((s) => LIVE_EVENTS.has(s.stage_type));
}
