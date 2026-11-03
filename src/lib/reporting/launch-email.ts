import type { EmailCopy } from "@/lib/jobs/copy";
import { greeting } from "@/lib/email/greeting";

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
  /**
   * **What the launch is called, to the client.**
   *
   * Nina, 3 November: "use the launch's linked offer; if none is linked,
   * use the launch name". The two are often different and the offer is
   * the one the client recognises — a launch is named for the team's
   * convenience ("Autumn challenge"), where the offer is the thing they
   * bought and sell ("The Freedom Experience"). `offerName` is null when
   * no offer is linked, which is allowed: `offer_entity_id` is nullable
   * and set null if the offer row is ever removed.
   */
  update({
    name,
    businessName,
    launchName,
    offerName,
    url,
  }: {
    name: string | null;
    businessName: string;
    launchName: string;
    offerName?: string | null;
    url: string;
  }): EmailCopy {
    const what = offerName?.trim() || launchName;

    return {
      subject: `Your ${what} launch tracker has been updated`,
      body: [
        greeting(name),
        `We've updated the launch tracker for ${what} (${businessName}) - there are newer figures in it than the last time you looked.`,
        `See it here: ${url}`,
        `Team Allegro`,
      ],
    };
  },
};
