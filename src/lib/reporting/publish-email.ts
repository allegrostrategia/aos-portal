import type { EmailCopy } from "@/lib/jobs/copy";
import { greeting } from "@/lib/email/greeting";
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
 * **Every word is Nina's, given on 3 November and used as written** —
 * the exclamation marks, "Team Allegro" rather than "Allegro Strategia",
 * and the sentence about the monthly strategy call, which is the one
 * thing in either email that says what happens next. Asserted line for
 * line in the test beside this file, the same arrangement as the two
 * report panels: her words are not a screen's to reword.
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
        greeting(name),
        `Your ${monthName(month)} report for ${businessName} is ready for you!`,
        `We'll go through the key bits on your monthly strategy call but please have a read through before then so you're in the loop.`,
        `It covers where the month went, what we make of it, and what changes we're suggesting!`,
        `Read it here: ${url}`,
        `If you want to add any comments before the call, you can reply underneath the report itself and we'll pick it up there.`,
        `Team Allegro`,
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
        greeting(name),
        `We've updated your ${monthName(month)} report for ${businessName}.`,
        `Something in it needed correcting, so the version you read before isn't the current one.`,
        `The updated report: ${url}`,
        `This is now fully up to date.`,
        `Team Allegro`,
      ],
    };
  },
};
