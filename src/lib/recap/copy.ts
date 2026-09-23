import { formatCalendarMonth } from "@/lib/time-zone";
import { formatHours } from "@/lib/hours/milestones";
import type { EmailCopy } from "@/lib/jobs/copy";

/**
 * Every word a member reads about their monthly recap, in one file.
 *
 * **Nina's wording, confirmed 23 September 2026**, replacing the placeholder
 * draft. It arrived written for one member's September, so the month, the name
 * and the figures are interpolated here rather than fixed — a card that said
 * "September" to somebody reading their October review would undo the point of
 * it. The figures come from `stats`, frozen on the recap when it was sent, so
 * they always agree with the writing they announce.
 *
 * Two lines of the confirmed copy could not live here, because they cannot be
 * true for everybody (raised with Dom, 23 Sep):
 *
 *   · "Two roadmap actions are properly done too" — templated below, and
 *     dropped entirely for a member who finished none, rather than emailing
 *     them a zero.
 *   · "One enquiry nearly slipped through again & this time, it didn't", and
 *     the subject's "September's actually quite good" — one is about a single
 *     person's month, the other judges every month it is sent about. Both are
 *     now **`personalLine`**: one sentence Nina writes per recap, used verbatim
 *     as the subject and as the email's opening hook. The templated subject
 *     below is only the fallback for a recap sent without one.
 *
 * Replacing any of this is still an edit to this file alone: no screen, action
 * or email composes its own sentence.
 */

/** Frozen on the recap at send. Null on anything sent before it existed. */
export type RecapStats = {
  trackedHours: number;
  reclaimedHours: number;
  actionsDone: number;
};

/** "September", not "September 2026" — the year is never in Nina's copy. */
function monthName(month: string): string {
  return formatCalendarMonth(month).split(" ")[0];
}

export const RECAP_COPY = {
  archiveTitle: "Monthly reviews",
  archiveEmpty:
    "Nothing here yet. Nina writes these up after the month ends, and every one stays here afterwards.",

  /** The Piazza card, shown while a sent recap is unread. */
  card: {
    eyebrow: (month: string) => `Your ${monthName(month)}, done`,
    title: "Your review is here",
    body: (stats: RecapStats | null) =>
      stats
        ? `${formatHours(stats.trackedHours)} hours tracked & ${formatHours(stats.reclaimedHours)} hours reclaimed this month.`
        : "Nina's written up your month.",
    button: "Read your review",
  },

  /** The read page itself. */
  page: {
    title: (month: string) => `Your ${monthName(month)}, actually written down`,
    intro:
      "Here's what the month actually looked like, in numbers & in your own words.",
    backToArchive: "All your reviews",
  },

  email(input: {
    firstName: string;
    month: string;
    url: string;
    stats: RecapStats | null;
    /** Nina's sentence for this member's month. Verbatim, never interpolated. */
    personalLine: string | null;
  }): EmailCopy {
    const { stats } = input;
    const line = input.personalLine?.trim() || null;

    return {
      // Hers where she wrote one. The fallback keeps the shape of her copy
      // without its judgement — "actually quite good" is not something a
      // template can promise about somebody's month.
      subject: line ?? `Your ${monthName(input.month)} review, ${input.firstName}`,
      body: [
        `${input.firstName},`,
        ...(line ? [line] : []),
        // Dropped when there is nothing to report, rather than opening with
        // "0 hours tracked this month & 0 hours reclaimed for good" — which is
        // the same rule as the actions line below, and the honest version of
        // Nina's sentence for a month that didn't go that way.
        ...(stats && (stats.trackedHours > 0 || stats.reclaimedHours > 0)
          ? [
              `${formatHours(stats.trackedHours)} hours tracked this month & ${formatHours(stats.reclaimedHours)} hours reclaimed for good.`,
            ]
          : []),
        // Dropped at zero rather than sent as "0 roadmap actions are done".
        ...(stats && stats.actionsDone > 0
          ? [
              stats.actionsDone === 1
                ? `One roadmap action is properly done too.`
                : `${stats.actionsDone} roadmap actions are properly done too.`,
            ]
          : []),
        `Your full review's ready, written up properly. Go and read it (you earned it).`,
        `Read it: ${input.url}`,
      ],
    };
  },
} as const;
