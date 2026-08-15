// Relative rather than the usual `@/` alias: this module is covered by unit
// tests, and Node's test runner resolves imports itself without the bundler's
// path mapping. Type-only imports are fine either way — type stripping erases
// them — but a runtime import has to be resolvable by Node.
import {
  buildItinerary,
  mondayOf,
  type IsoDate,
} from "../onboarding/cadence.ts";

/**
 * Priming content — the check-in screen's third job (§1).
 *
 * One short piece per week during onboarding, on the screen they're already
 * visiting. No new area to find, which is the point.
 *
 * **Universal, never personalised.** §1 is explicit: every member sees the same
 * three pieces regardless of business type or data. The moment it's tailored it
 * needs the same diagnostic logic as the real library, which defeats the point of
 * having something available before any diagnosis exists.
 *
 * ⚠️ Copy is a first draft against the topics §1 specifies. Nina's to approve.
 */

export type PrimingPiece = {
  week: 2 | 3 | 4;
  title: string;
  body: string[];
};

export const PRIMING: Record<2 | 3 | 4, PrimingPiece> = {
  2: {
    week: 2,
    title: "Why we start with the tracking",
    body: [
      "Most people can tell you what they'd like to spend their week on. Almost nobody can tell you what they actually spent it on — not to the hour, not without guessing.",
      "That gap is the whole reason this comes first. Your roadmap gets built from what's really there, not from a sense of it. Two weeks is enough to see a pattern rather than a bad Tuesday.",
      "Log as you go rather than reconstructing it on Friday. Reconstructed weeks are tidier than real ones, and the tidy version is the one that hides the problem.",
    ],
  },
  3: {
    week: 3,
    title: "Getting your numbers ready",
    body: [
      "Next week's conversation goes further if you arrive with a few figures to hand. Nothing formal — you don't need your accountant.",
      "Worth knowing before the call: what you currently charge, and how (hourly, per package, monthly). Roughly what came in last month. Roughly what goes out each month. How many clients you're actively delivering to right now.",
      "The pricing figure matters most. Your delivery hours only mean something measured against what those hours earn — that comparison is what tells us whether the answer is better systems or better pricing, and they lead to completely different months.",
    ],
  },
  4: {
    week: 4,
    title: "What to expect in your 1:1",
    body: [
      "An hour with Nina, and you'll leave with your roadmap. She'll have your tracking and your audit in front of her already, so the time goes on what to do about it rather than on catching up.",
      "Bring the thing that's been nagging at you. The tracking usually surfaces it anyway, but the conversation is faster when you name it yourself.",
      "You don't need to prepare anything else. There's no presentation and nothing to tidy up first — an honest picture of a messy month is more useful than a polished account of an average one.",
    ],
  },
};

/**
 * Which piece a member should see this week, if any.
 *
 * Returns null once onboarding's three weeks are behind them — active members
 * have the real library instead, and this content is scaffolding for the weeks
 * before any diagnosis exists.
 */
export function primingForWeek(
  onboardingStartDate: IsoDate | null,
  today: IsoDate,
): PrimingPiece | null {
  if (!onboardingStartDate) return null;

  const itinerary = buildItinerary(onboardingStartDate);
  const thisMonday = mondayOf(today);

  if (thisMonday === itinerary.trackingWeekOne) return PRIMING[2];
  if (thisMonday === itinerary.trackingWeekTwo) return PRIMING[3];
  if (thisMonday === itinerary.oneToOneWeek) return PRIMING[4];

  return null;
}
