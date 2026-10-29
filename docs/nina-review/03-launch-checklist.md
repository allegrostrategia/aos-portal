# Before any of this goes on

Twelve things that can only be done with a real client, a real month, or your eyes on them. None can be finished before launch, and none should be skipped at it.

**One is being done now** and the rest wait for a real client, a real month, or your eyes. Your review of 29 October closed the dashes question at number 8 and added two, numbers 9 and 10, both of them wording you haven't read — and number 3's wording is now written out in full in [04-wording.md](04-wording.md) for you to mark up.

**All three questions that were open for you are now decided:**

- **The celebration lines stay as they are.** "Stunning", "& that's no accident", "WOOOO" and "exactly the direction we want" are untouched. Only the lines going the wrong way lost their tails.
- **A Chiarezza login gets no upload card.** Members upload their own Meta exports; a one-off attendee still fills those two sections in by hand.
- **Up-and-down arrows: yes.** "Everything else this month" carries them now, in the same style as the cards above it, with neutral figures in grey. Built and photographed at both widths.

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

Five emails exist and none has been read by you in the form a client receives. **Their full text is in [04-wording.md](04-wording.md)**, set out for you to mark up:

- the invitation to a reporting client
- "your report for August is ready"
- the same again after a correction, worded as an update
- **"Your [launch] tracker has been updated"** — new, from your decision 12
- the two monthly reminders to members, on the 1st and the 8th

The reminder wording is taken **verbatim from your brief**. The other four were written for you and need your eye.

One of them, the invitation, **lives in the Supabase dashboard rather than in our code** — so it is the only one that can be changed without a deploy, and the only one nobody has ever seen arrive. Its exact text is in 04-wording.md, and reading it turned up two things:

- **The sender name is misspelt: "Allegro Stategia", missing the *r*.** It is on every auth email — invitations, password resets, the lot — and it is the first thing in anybody's inbox. One field in the dashboard, no deploy. **Dom doing now.**
- **The invitation says nothing about Allegro Strategia or about a report.** It is Supabase's default wording with only the link corrected. Yours to decide whether it should say more.

**Custom SMTP is already set up**, so invitations are not going through Supabase's default sender and its three-an-hour limit. They go via Resend from `noreply@allegrostrategia.com`, the same provider and domain as the product emails. The auth rate limit is **30 emails an hour**, which is a real ceiling only on a day somebody invites a lot of people at once.

## 4. The draw prizes still say "test" — **Dom doing now**

Both months that exist carry a placeholder: August reads **"testy"** and September reads **"test"**. Neither has been drawn. The prize is in front of every member every day on Piazza, so **both want real text before the first member joins** — not before launch day, but before anybody who isn't us can read them.

## 5. Test Client's contact was called "Nina" — **done, 29 October**

The grant on the test reporting workspace carried the display name "Nina", which would have appeared on anything naming the client contact. It now reads **"Test Client"**, changed on the live database and read back.

It could also have been done from the screen: **Reporting → the client's card → Edit details → "Client contact's name"**, which has existed since 5 October for exactly this.

**And there is now a way to stop a reporting login.** Until 29 October there was none at all — cancelling a member needs a membership, and a retainer client deliberately has none, so the only ways out were deleting their grant by hand or disabling the account in Supabase. The card now carries **"End this client's access"**: two presses, nothing deleted, and the card afterwards says who lost access and when. Every month, figure, note and reply stays, and stays readable to you.

## 6. Unpublish → fix → republish, done once for real

The route exists and is tested, but nobody has walked it on a live month with a real client's figures. It sends a second email, worded as an update. Worth doing once, deliberately, before it happens by accident.

## 7. The trend charts, read against real history

Every chart with more than one month in it has only ever been drawn from seeded data. They need a real client with three or four real months behind them before anyone can say they read correctly — a chart that's right for one month and wrong across six looks the same on the day it's built.

## 8. The dashes

**Half of this is now settled.** You decided on 28 October that a campaign with no figures stays on the published report as a row of dashes, so there is nothing to judge there.

What is left needs a real month: **a figure nobody entered shows a dash, not a zero** — decision 1. It's right, and it means a half-finished month looks sparse to a client in a way only a real month will tell you about.

## 9. The holding screen's wording

New, from your decision 10. A client whose month isn't out yet now reads:

> **Your October report is being prepared**
> Your strategist is still putting this month together. You'll be emailed as soon as it's ready to read, and your earlier months are all still here in the month picker.

That's the first thing a client sees in the gap between months, and it was written for you rather than by you. It's in the review pack at `screens-review/03-being-prepared-client`.

## 10. The Focus area tag, read on a full month

New, from your decision 3. The tag works on the test data, where the panel holds one or two lines. What nobody has seen is a month where all three attention lines fire at once, which is when the old repeated tail looked worst and is the only real test of whether a repeated tag reads better.

It needs a real month with three things going the wrong way. You've already said the celebration lines stay as they are, so this is a look rather than a decision — unless seeing three at once changes your mind.

## 11. A Chiarezza login for testing the self-serve side

There isn't one, and it is the cleanest way to keep testing the member-facing report after the test accounts are cancelled.

A Chiarezza login is an account with **no membership behind it** — so it touches nothing in the members' half of aOS: no draw, no pairing, no hot seat, no directory, no chat, no reminder emails. It can still fill in its own figures, which is the half that needs checking. And it expires on a date set when it is created, so it cleans itself up.

Two things it won't test, for the same reason it is safe: the monthly reminder emails (those go to members, and it isn't one) and the Meta CSV upload card (hidden for Chiarezza by your decision).

## 12. Cancelling the test accounts

Five accounts on the live site are ours, and the three that are members take up room in the draw, in pairing, on the hot seat sheet and in the reminder emails that go out every Wednesday and Friday.

The plan, in order: the directory fix goes out first — until 29 October a cancelled member kept their card in the directory, which would have left ghosts behind — then `dominicchentrens@`, `nina.ellen.oliver@` and `contact+test3@` are cancelled, and `yungsl5dom@` last, once the switches are on and the walkthrough is done.

Cancelling revokes access and keeps every record, as it always has. Nothing is deleted.
