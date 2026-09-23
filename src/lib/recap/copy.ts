import { formatCalendarMonth } from "@/lib/time-zone";
import type { EmailCopy } from "@/lib/jobs/copy";

/**
 * Every word a member reads about their monthly recap, in one file.
 *
 * **Provisional, and deliberately all in one place.** Dom, 23 September 2026:
 * the real wording is his and Nina's, and this is a draft to build against so
 * nothing is blocked waiting for it. Replacing it is an edit to this file
 * alone — no screen, action or email composes its own sentence, and a search
 * for any of these strings anywhere else in `src/` should come back empty.
 *
 * The house voice, while it stands in: plain, warm, no exclamation mark, and
 * it never says how the month went. The recap itself is Nina's writing; this
 * is only the knock at the door.
 */

export const RECAP_COPY = {
  /** The heading over the archive on You, and the read page's eyebrow. */
  archiveTitle: "Monthly reviews",
  archiveEmpty:
    "Nothing here yet. Nina writes these up after the month ends, and every one stays here afterwards.",

  /** The Piazza card, shown while a sent recap is unread. */
  card: {
    eyebrow: "Monthly review",
    title: (month: string) => `Your ${formatCalendarMonth(month).split(" ")[0]} review is here`,
    body: "Nina's written up your month. It stays in your profile afterwards.",
    button: "Read it",
  },

  /** The read page itself. */
  page: {
    title: (month: string) => `Your ${formatCalendarMonth(month)} review`,
    intro: "Written by Nina, from your own month.",
    backToArchive: "All your reviews",
  },

  email(input: { firstName: string; month: string; url: string }): EmailCopy {
    const monthName = formatCalendarMonth(input.month).split(" ")[0];
    return {
      subject: `Your ${monthName} review`,
      body: [
        `${input.firstName},`,
        `Nina's written up your ${monthName} — the hours you reclaimed, what you finished, and what it adds up to.`,
        `It stays in your profile afterwards, so you can read it back any time.`,
        `Read it: ${input.url}`,
      ],
    };
  },
} as const;
