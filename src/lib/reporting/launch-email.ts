import type { EmailCopy } from "@/lib/jobs/copy";

/**
 * Every word a client reads when a launch tracker is updated.
 *
 * Nina's decision 12, changed on 28 October. Publishing a launch still
 * sends nothing — that was decision 12's original answer and it stands,
 * because a launch is published once and mentioned in the next monthly
 * report. What she asked for is a **button**: a launch's figures carry on
 * arriving for weeks after the cart shuts, and there was no way to tell a
 * client that last week's numbers had moved without waiting for the month.
 *
 * **Nothing automatic.** No save sends this, no publish sends this, and
 * nothing in the daily cron sends this. Somebody presses it.
 *
 * **No figures**, the same rule as the monthly email and for the same two
 * reasons: a number in an inbox outlives its correction, and a report
 * readable without signing in has stopped being private.
 *
 * Pure, so the wording can be read and tested without sending anything.
 */
export const LAUNCH_EMAIL = {
  update({
    name,
    businessName,
    launchName,
    url,
  }: {
    name: string | null;
    businessName: string;
    launchName: string;
    url: string;
  }): EmailCopy {
    return {
      subject: `Your ${launchName} tracker has been updated`,
      body: [
        `${name ? `${name},` : "Hello,"}`,
        `We've updated the launch tracker for ${launchName} (${businessName}) — there are newer figures in it than the last time you looked.`,
        `See it here: ${url}`,
        `If anything in it needs a conversation, do say and we'll pick it up.`,
        `Allegro Strategia`,
      ],
    };
  },
};
