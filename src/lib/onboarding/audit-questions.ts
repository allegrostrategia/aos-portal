/**
 * The onboarding audit's question set.
 *
 * ⚠️ PLACEHOLDER COPY. The real multiple-choice questions and answer options are
 * Nina's to write (§1, "Still Nina's action item"). Everything below is
 * scaffolding written to the right shape so the form, the scoring and the admin
 * view can all be built and tested now; swapping in the real set means editing
 * this file and nothing else.
 *
 * Shape follows §1: multiple choice, one group per station, scoring which "pot"
 * a member is weakest in. Answers are stored on `member_audits.answers` keyed by
 * question id, and the derived scores on `member_audits.scores`, so changing the
 * questions later doesn't rewrite anyone's past diagnosis.
 *
 * **Scoring direction: higher is stronger.** The weakest station is the lowest
 * total, and that's what the roadmap draft aims at. Getting this backwards would
 * point every member at whatever they're already best at, and it would look
 * entirely plausible while doing it.
 */

import type { Bucket } from "@/lib/supabase/types";

export type AuditOption = {
  value: string;
  label: string;
  /** 0 = this is a real problem, 3 = handled well. */
  score: 0 | 1 | 2 | 3;
};

export type AuditQuestion = {
  id: string;
  stationSlug: string;
  bucket: Bucket;
  prompt: string;
  options: AuditOption[];
};

/** Reused wherever a question is a plain "how handled is this?" — most of them. */
function standardOptions(
  never: string,
  sometimes: string,
  mostly: string,
  always: string,
): AuditOption[] {
  return [
    { value: "never", label: never, score: 0 },
    { value: "sometimes", label: sometimes, score: 1 },
    { value: "mostly", label: mostly, score: 2 },
    { value: "always", label: always, score: 3 },
  ];
}

export const AUDIT_QUESTIONS: AuditQuestion[] = [
  {
    id: "systems_process",
    stationSlug: "studio-dell-architetto",
    bucket: "systems_delivery",
    prompt: "How much of your delivery runs on a written process?",
    options: standardOptions(
      "None of it — it lives in my head",
      "A few things are written down",
      "Most of it, though it needs updating",
      "All of it, and it's current",
    ),
  },
  {
    id: "automation",
    stationSlug: "officina-vespa",
    bucket: "systems_delivery",
    prompt: "How much of your admin happens without you touching it?",
    options: standardOptions(
      "Nothing is automated",
      "One or two things",
      "A good chunk of it",
      "Almost everything repetitive",
    ),
  },
  {
    id: "visibility",
    stationSlug: "cinema-allegro",
    bucket: "visibility",
    prompt: "How consistently are you visible to the people you want to reach?",
    options: standardOptions(
      "Rarely — it slips when I'm busy",
      "In bursts",
      "Fairly steadily",
      "Consistently, and it's planned",
    ),
  },
  {
    id: "leads",
    stationSlug: "piazza-caffe",
    bucket: "visibility",
    prompt: "Where do new enquiries come from?",
    options: [
      { value: "luck", label: "Word of mouth and luck", score: 0 },
      { value: "referral", label: "Mostly referrals", score: 1 },
      { value: "mixed", label: "A mix, some of it repeatable", score: 2 },
      { value: "system", label: "A system I could describe", score: 3 },
    ],
  },
  {
    id: "offers",
    stationSlug: "la-boutique",
    bucket: "profit",
    prompt: "How settled are your offers and prices?",
    options: standardOptions(
      "I quote case by case",
      "Roughly set, often discounted",
      "Set, occasionally revisited",
      "Set, tested, and I hold them",
    ),
  },
  {
    id: "money",
    stationSlug: "banco-allegro",
    bucket: "profit",
    prompt: "How closely do you track your numbers?",
    options: standardOptions(
      "I look when something worries me",
      "Now and again",
      "Monthly",
      "Weekly, against a plan",
    ),
  },
  {
    id: "launches",
    stationSlug: "stazione-centrale",
    bucket: "launch",
    prompt: "How do launches tend to go?",
    options: standardOptions(
      "I avoid them",
      "Ad hoc, and exhausting",
      "Planned, with mixed results",
      "Planned, repeatable, predictable",
    ),
  },
  {
    id: "events",
    stationSlug: "terrazza",
    bucket: "launch",
    prompt: "Do in-person events play any part in your business?",
    options: [
      { value: "no", label: "No, and I'd like them to", score: 0 },
      { value: "once", label: "I've tried once", score: 1 },
      { value: "occasional", label: "Occasionally, informally", score: 2 },
      { value: "core", label: "Yes, they're part of the plan", score: 3 },
    ],
  },
  {
    id: "membership",
    stationSlug: "club-allegro",
    bucket: "profit",
    prompt: "Do you have recurring revenue you can rely on?",
    options: standardOptions(
      "None at all",
      "A little, and it fluctuates",
      "Some, fairly steady",
      "Yes, and it covers my base costs",
    ),
  },
];

export type AuditScores = {
  station: Record<string, number>;
  bucket: Record<string, number>;
};

export type ScoredAudit = {
  scores: AuditScores;
  weakestStationSlug: string | null;
  weakestBucket: Bucket | null;
};

/**
 * Turn raw answers into the scores stored on the audit.
 *
 * Unanswered questions are skipped rather than counted as zero — a blank isn't
 * evidence of weakness, and treating it as such would let an abandoned form
 * decide someone's roadmap. Buckets are averaged rather than summed, because
 * they hold different numbers of questions and a sum would simply elect
 * whichever bucket has the most.
 */
export function scoreAudit(answers: Record<string, string>): ScoredAudit {
  const station: Record<string, number> = {};
  const bucketTotals: Record<string, { total: number; count: number }> = {};

  for (const question of AUDIT_QUESTIONS) {
    const answer = answers[question.id];
    if (!answer) continue;

    const option = question.options.find((o) => o.value === answer);
    if (!option) continue;

    station[question.stationSlug] =
      (station[question.stationSlug] ?? 0) + option.score;

    const bucket = (bucketTotals[question.bucket] ??= { total: 0, count: 0 });
    bucket.total += option.score;
    bucket.count += 1;
  }

  const bucket: Record<string, number> = {};
  for (const [key, { total, count }] of Object.entries(bucketTotals)) {
    bucket[key] = Number((total / count).toFixed(2));
  }

  const weakest = <T extends string>(scores: Record<T, number>): T | null => {
    const entries = Object.entries(scores) as [T, number][];
    if (entries.length === 0) return null;
    return entries.reduce((low, next) => (next[1] < low[1] ? next : low))[0];
  };

  return {
    scores: { station, bucket },
    weakestStationSlug: weakest(station),
    weakestBucket: weakest(bucket) as Bucket | null,
  };
}
