# Before any of this goes on

Eight things that can only be done with a real client, a real month, or your eyes on them. None can be finished before launch, and none should be skipped at it.

They're in the order they'd naturally happen.

---

## 1. The live sign-in checks, which were skipped

**Not done.** On 9 October the reporting work was deployed and nobody signed in to look, because Test Client's password isn't recorded anywhere and there are no credentials for the test member account.

Nothing about that deploy was unsafe — every screen is behind a switch that a Vercel setting can't move — but **it is unverified on the live site**, and it has to happen before any switch goes on.

- As **Test Client**: `/reporting` shows six tabs and a note from the strategist, and **none** of "Your reflection", "Your report settings" or "What you're focusing on next month".
- As **dom** (the test member): `/piazza` has no "It is not finished yet" card, `/you` has no "Your monthly report" row, and `/reporting/settings` is a 404.
- As an admin: `/admin/reporting` shows three headings with counts, and a status line against the member. **This one is already live** and is the only reporting change that is.

## 2. The whole thing on a real retainer client

The last item in the brief's section 11.2, and the only part that emails somebody. Create them from `/admin/reporting` **on the live site** — invitations refuse to send from a development machine, because the link they build would only work on the machine that sent it.

Then: enter a month, publish it, read it as them, reply as them, and read the reply as you.

## 3. The email wording

Four emails exist and none has been read by you in the form a client receives:

- the invitation to a reporting client
- "your report for August is ready"
- the same again after a correction, worded as an update
- the two monthly reminders to members, on the 1st and the 8th

The reminder wording is taken **verbatim from your brief**. The other three were written for you and need your eye.

## 4. The draw prize still says "test"

The prize text on Piazza reads as a placeholder. One line, and it's in front of every member every day.

## 5. Test Client's contact is called "Nina"

The grant on the test reporting workspace carries the display name "Nina", which is wrong and would appear on anything that names the client contact. Correct it or delete the grant before a real client is added beside it.

## 6. Unpublish → fix → republish, done once for real

The route exists and is tested, but nobody has walked it on a live month with a real client's figures. It sends a second email, worded as an update. Worth doing once, deliberately, before it happens by accident.

## 7. The trend charts, read against real history

Every chart with more than one month in it has only ever been drawn from seeded data. They need a real client with three or four real months behind them before anyone can say they read correctly — a chart that's right for one month and wrong across six looks the same on the day it's built.

## 8. The dashes

Two related things, both needing a real month to judge:

- **A campaign with no figures shows as a row of dashes** on a published report, whether it came from a file or was typed. Both answers are defensible, and it's the one thing on your decisions list a client can already see.
- **A figure nobody entered shows a dash, not a zero** — decision 1. It's right, and it means a half-finished month looks sparse to a client in a way that only a real month will tell you about.
