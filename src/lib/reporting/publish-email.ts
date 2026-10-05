import type { EmailCopy } from "@/lib/jobs/copy";
import { formatCalendarMonth } from "@/lib/time-zone";

/**
 * Every word a client reads when a month is published.
 *
 * **No figures.** It is a notification, not the report — the same choice the
 * monthly recap made, and for the same two reasons: a number in an inbox
 * outlives the correction, and a report that can be read without signing in
 * is a report that has stopped being private. Settled with Dom and Nina,
 * 5 October 2026.
 *
 * Pure, so the wording can be read and tested without sending anything.
 */

/** "August 2026" — a client sees this months later; the year earns its place. */
function monthName(month: string): string {
  return formatCalendarMonth(month);
}

export const PUBLISH_EMAIL = {
  /**
   * The first time a month goes out.
   *
   * `name` is the client's own display name from their grant, which is the
   * only name the app has for them — a retainer client has no `members` row
   * by design, and `auth.users` is not readable under RLS.
   */
  first({
    name,
    businessName,
    month,
    url,
  }: {
    name: string | null;
    businessName: string;
    month: string;
    url: string;
  }): EmailCopy {
    return {
      subject: `Your ${monthName(month)} report is ready`,
      body: [
        `${name ? `${name},` : "Hello,"}`,
        `Your ${monthName(month)} report for ${businessName} is ready to read.`,
        `It covers where the month went, what we make of it, and what we're focusing on next.`,
        `Read it here: ${url}`,
        `If anything in it needs a conversation, you can reply underneath the report itself and we'll pick it up there.`,
        `Allegro Strategia`,
      ],
    };
  },

  /**
   * A month published again after a correction.
   *
   * Nina's decision, 5 October: a republish does send, worded as an update
   * rather than as a new report, so a client reading a changed figure knows
   * it changed. The alternative — staying quiet — leaves them with a number
   * they have already read and acted on.
   */
  update({
    name,
    businessName,
    month,
    url,
  }: {
    name: string | null;
    businessName: string;
    month: string;
    url: string;
  }): EmailCopy {
    return {
      subject: `Your ${monthName(month)} report has been updated`,
      body: [
        `${name ? `${name},` : "Hello,"}`,
        `We've updated your ${monthName(month)} report for ${businessName}. Something in it needed correcting, so the version you read before isn't the current one.`,
        `The updated report: ${url}`,
        `Do reply underneath it if you'd like to go through what changed.`,
        `Allegro Strategia`,
      ],
    };
  },
};
