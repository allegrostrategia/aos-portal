import { formatMinutes } from "@/lib/timer/format";
import type { ReminderKind } from "./reminders";
import type { HotSeatReminderKind } from "./hot-seat-reminders";

/**
 * What every reminder says.
 *
 * Separated from sending so the wording can be read without dispatching
 * anything. Checking a change of copy previously meant deleting a queue row,
 * re-running the cron and waiting on an inbox — three steps that test delivery,
 * which already works, rather than the words, which were the thing in question.
 *
 * Pure functions: no database, no clock, no network.
 */

export type EmailCopy = { subject: string; body: string[] };

export function renderEmail(copy: EmailCopy): string {
  return copy.body.join("\n\n");
}

export function weeklyLogCopy(
  kind: ReminderKind,
  input: { firstName: string; loggedMinutes: number; shortBy: number; logUrl: string },
): EmailCopy {
  if (kind === "log_reminder_midweek") {
    return {
      subject: "Your week so far",
      body: [
        `${input.firstName},`,
        `You're at ${formatMinutes(input.loggedMinutes)} logged this week. Ten hours is what makes a week count.`,
        `Nothing to fill in and nothing to write up — start the timer when you begin something, stop it when you're done. The point isn't the total; it's that your roadmap gets built from where the time actually went rather than where you think it went.`,
        `Your log: ${input.logUrl}`,
      ],
    };
  }

  return {
    subject: `${formatMinutes(input.shortBy)} off a complete week`,
    body: [
      `${input.firstName},`,
      `You're ${formatMinutes(input.shortBy)} short of ten hours, so this week won't count yet — and complete weeks are what put you in the monthly draw.`,
      `If you've done the hours and just haven't logged them, you can add them after the fact. Reconstructed is worth less than tracked, but it's worth a great deal more than nothing.`,
      `Your log: ${input.logUrl}`,
    ],
  };
}

export function hotSeatCopy(
  kind: HotSeatReminderKind,
  input: {
    firstName: string;
    when: string;
    zoomUrl: string | null;
    baseUrl: string;
    hasSubmitted: boolean;
  },
): EmailCopy {
  const { firstName, when, zoomUrl, baseUrl, hasSubmitted } = input;
  const join = zoomUrl ? `Join here: ${zoomUrl}` : `Details: ${baseUrl}/hot-seat`;

  switch (kind) {
    case "hot_seat_submit_7d":
      return {
        subject: "The hot seat is a week away",
        body: [
          `${firstName},`,
          `The next hot seat is ${when}. One hour, everyone together, and whoever turns up gets worked on live.`,
          `There are three questions to answer beforehand: what you're stuck on, what you've already tried, and what "done" would look like by the end of your slot.`,
          `That last one does most of the work. Five minutes is enough to build one specific thing and not enough to decide what that thing should be — so arriving with it named is the difference between building and talking.`,
          `Submit here: ${baseUrl}/hot-seat`,
        ],
      };

    case "hot_seat_submit_2d":
      return {
        subject: "Two days until the hot seat",
        body: [
          `${firstName},`,
          `The hot seat is ${when} and yours hasn't come in yet.`,
          `It takes a few minutes. Nina reads it alongside your tracked hours beforehand, so she arrives already knowing where your month went and what you want out of it — which is what makes a short slot worth having.`,
          `Submit here: ${baseUrl}/hot-seat`,
        ],
      };

    case "hot_seat_submit_final":
      return {
        subject: "Hot seat today — still time to submit",
        body: [
          `${firstName},`,
          `Today's session is ${when}, and there's still time to get yours in.`,
          `You're welcome either way — nobody is turned away for not submitting. But without one it gets worked out from scratch in the room, and that's a slower use of your five minutes than arriving with Nina already prepped.`,
          `Submit here: ${baseUrl}/hot-seat`,
        ],
      };

    case "hot_seat_attend_1d":
      // Goes to everyone active, submitted or not — so it can't assume a
      // submission is in. Branched rather than written vaguely enough to cover
      // both, which would have meant saying nothing true to either.
      return {
        subject: "Hot seat tomorrow",
        body: hasSubmitted
          ? [
              `${firstName},`,
              `The hot seat is ${when}.`,
              `Nothing more to prepare. Nina reads your submission alongside your tracked hours beforehand and comes with a direction already drafted — the live part is confirming that and building it, rather than working out what to build.`,
              join,
            ]
          : [
              `${firstName},`,
              `The hot seat is ${when}, and yours hasn't come in.`,
              `There's still time. A submission is what lets Nina arrive with a direction already drafted, so the session goes on building rather than on working out what to build.`,
              `Submit here: ${baseUrl}/hot-seat`,
            ],
      };

    case "hot_seat_attend_am":
      return {
        subject: "Hot seat today",
        body: [
          `${firstName},`,
          `Today, ${when}.`,
          `Nina has your submission and your tracked hours, and comes with a direction drafted from them. Your few minutes go on confirming that and building it — not on explaining where you're up to.`,
          join,
        ],
      };
  }
}

/**
 * Somebody said something, and it's been sitting there.
 *
 * Deliberately doesn't quote the message. A voice note has no text to quote, and
 * repeating a direct message into an inbox turns a private conversation into
 * email — which is not what either person agreed to when they wrote it.
 */
export function chatUnreadCopy(input: {
  firstName: string;
  fromName: string;
  count: number;
  chatUrl: string;
}): EmailCopy {
  const what =
    input.count === 1 ? "a message" : `${input.count} messages`;

  return {
    subject: `${input.fromName} sent you ${what}`,
    body: [
      `${input.firstName},`,
      `${input.fromName} sent you ${what} in the portal, and it's still unread.`,
      `Nothing needs answering straight away — this is only here so a reply doesn't sit unseen for days.`,
      `Read it: ${input.chatUrl}`,
    ],
  };
}

/**
 * You're paired with somebody this month (§9).
 *
 * Says who and when you both said you're free, and stops there. No call link,
 * because §9 is deliberate that the pair arrange that themselves — offering one
 * would quietly turn a peer conversation into a scheduled appointment.
 */
export function pairingBookedCopy(input: {
  firstName: string;
  partnerName: string;
  sharedTimes: string | null;
  pairingUrl: string;
}): EmailCopy {
  return {
    subject: `You're paired with ${input.partnerName} this month`,
    body: [
      `${input.firstName},`,
      `This month you're paired with ${input.partnerName}. Both of you bring something you're stuck on, both of you give and get — about fifteen minutes each way.`,
      input.sharedTimes
        ? `You both said ${input.sharedTimes} works.`
        : `You didn't tick any of the same slots, so you'll need to find a time between you.`,
      `Message them in the portal to sort out when and where. There's no call link — it's your conversation to arrange.`,
      `Your pairing: ${input.pairingUrl}`,
    ],
  };
}

/**
 * A pairing that hasn't happened, a week in — for Nina, not for the pair.
 *
 * Framed as something to look at rather than something wrong. §9 tracks met and
 * not-met as signal, not shame, and an email that reads as a telling-off about
 * somebody else's diary would make Nina reluctant to act on it.
 */
export function pairingStalledCopy(input: {
  names: string[];
  month: string;
  adminUrl: string;
}): EmailCopy {
  return {
    subject: `${input.names.join(" and ")} haven't met yet`,
    body: [
      `A week into ${input.month} and this pairing hasn't been confirmed:`,
      input.names.join(" · "),
      `Might be nothing — plenty of people meet without marking it. Worth a nudge if it's been quiet, so it doesn't just never happen.`,
      `Pairings: ${input.adminUrl}`,
    ],
  };
}
