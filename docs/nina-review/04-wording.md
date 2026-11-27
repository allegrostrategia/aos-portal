# Every word a client or member reads

Nina — this is the full text of everything the reporting tool sends or shows that isn't a figure.

**Updated 3 November: these are now your words.** Everything you sent on 3 November is built exactly as you wrote it, and what's below is what will actually arrive. Two things in §1 still need you, and they're marked.

Each one says **when it goes out** and **who gets it**, then the email exactly as it arrives. The name, the month, the business and the launch are filled in per person; below they are shown with the test data, so "Bella", "Bella Ltd", "August 2026" and "Autumn challenge" are where a real one would be.

Emails are plain text, one blank line between paragraphs, no header image and no footer beyond the sign-off. That's deliberate: these are notifications, not newsletters.

**None of them carries a figure.** Not one number from the report goes in an email — a number in an inbox outlives its correction, and an email that can be read without signing in is a report that has stopped being private.

---

## 1. The invitation to a new reporting client

**When:** when you press **Send invitation** on their card — which is now a separate press from setting them up. **Updated 27 November:** adding a client used to send this immediately, so the first thing they ever received from aOS arrived before there was anything in their report. Setting one up now creates their workspace only; you enter their figures, publish the months you want them to see, and invite them when it is ready. Their card says "Not invited yet" until you do, and tells you if nothing is published.
**Who:** the client contact you named at set-up.

**This one lives in the Supabase dashboard rather than in our code** — Authentication → Emails → Invite user. So it's the only email on this list that can be changed without a deploy, and the only one nobody has watched arrive.

**It now says three different things, because it goes to three different kinds of person.** One template, and the app tells it which you are. Until 27 November everybody got the member wording below — including retainer clients, who are not joining a membership and have one screen, and Elize, who works here. The exact text is in `docs/reporting/invite-email-template.html` and a test holds the code and that file to each other.

**What a retainer client gets:**

> **Subject:** Your Allegro login is ready
>
> ## Your reporting login is ready 🍋
>
> I've set up your login for your Allegro reports - this is where your numbers live from now on.
>
> Every month we go through where the month went, what we make of it, and what we're suggesting next. You'll get an email the moment a new one is ready, and this login is how you read it.
>
> Click below to set your password & you're good to go
>
> [Accept invitation]
>
> Any thoughts as you read, you can reply underneath the report itself and we'll pick it up there.
>
> Speak soon!
> Nina x

**What a Chiarezza attendee gets:**

> **Subject:** Your Allegro login is ready
>
> ## Your Chiarezza login is ready 🍋
>
> I've set up your login for your Chiarezza numbers - this is where everything we worked through lives.
>
> Fill in your months as you go and the report builds itself. It's yours to read whenever you like.
>
> Click below to set your password & you're good to go
>
> [Accept invitation]
>
> Enjoy it!
> Nina x

**What an aOS member gets — unchanged, exactly as you wrote it:**

> **Subject:** Your Allegro login is ready
>
> ## Your aOS login is ready 🍋
>
> ## You're in!
>
> I've set up your login for aOS - everything you're going to come to love over the next few months lives here.
>
> Click below to set your password & you're good to go
>
> [Accept invitation]
>
> See you inside wooo!!
> Nina x

**And one you have not seen, because nobody had thought about it:** when Elize or anyone else on the team is given access to a client, that creates a login too, through the same template. She was being told her aOS login was ready and that everything she was going to come to love lived there, about a tool she works in. She now gets:

> ## Your Allegro login is ready 🍋
>
> I've set up your login - it opens on the clients you've been assigned and shows you nothing else.
>
> Click below to set your password & you're good to go
>
> [Accept invitation]
>
> Thank you!
> Nina x

**Two things still need you, and the first is the one that matters.**

**The subject line is fixed, 27 November.** It was Supabase's default — these landed in the inbox as **"You've been invited"**, which the last two versions of this page complained about. It now reads **"Your Allegro login is ready"**, one subject for all four wordings, because it has to make sense to a member, a retainer client, a Chiarezza attendee and Elize alike.

**One thing that follows from that, and it is a two-minute change if it grates.** The member version opens with "Your aOS login is ready 🍋" as its first heading, so a member now sees that subject and then almost the same sentence again at the top of the email. The three new wordings have one heading each. Say the word and the member body starts at "You're in!" instead, the way the rest of them start at their own first line.

**And it still opens with two headings in a row.** "Your aOS login is ready 🍋" and then "You're in!", both as large as each other. That reads as a mistake rather than a flourish, and with the new subject it is the third time in four lines. The three new wordings have one heading each for that reason; the member one is left exactly as you wrote it until you say otherwise.

**The sender's name is fixed.** It went out as "Allegro Stategia" — missing the *r* — until this was last written; the live setting now reads **Allegro Strategia** &lt;noreply@allegrostrategia.com&gt;, so that one is done.

**Still worth doing before the first real client:** send yourself one and read what arrives.

---

## 2. "Your report is ready"

**When:** the moment you press Publish on a month, the first time that month goes out.
**Who:** the client contact. Never a team member, and never an aOS member reporting on themselves.

> **Subject:** Your August 2026 report is ready
>
> Bella,
>
> Your August 2026 report for Bella Ltd is ready for you!
>
> We'll go through the key bits on your monthly strategy call but please have a read through before then so you're in the loop.
>
> It covers where the month went, what we make of it, and what changes we're suggesting!
>
> Read it here: https://aos.allegrostrategia.com/reporting?workspace=…&month=2026-08
>
> If you want to add any comments before the call, you can reply underneath the report itself and we'll pick it up there.
>
> Team Allegro

**The greeting is their first name only.** It's taken from the name you typed on their login — so "Bella Fawkes" is greeted "Bella,". If that login somehow has no name at all, the line reads `Hello,` rather than a bare comma; nobody has one, because the form makes you type it.

---

## 3. "Your report has been updated"

**When:** you press Publish again on a month that has already gone out — after unpublishing it, correcting something, and republishing.
**Who:** the same client contact.

> **Subject:** Your August 2026 report has been updated
>
> Bella,
>
> We've updated your August 2026 report for Bella Ltd.
>
> Something in it needed correcting, so the version you read before isn't the current one.
>
> The updated report: https://aos.allegrostrategia.com/reporting?workspace=…&month=2026-08
>
> This is now fully up to date.
>
> Team Allegro

This exists because of your own decision of 5 October: a client reading a changed figure should know it changed. The alternative is staying quiet about a number they've already acted on.

---

## 4. "Your launch tracker has been updated"

**When:** only when you press **Send update to client** on a published launch. Nothing else sends it — not saving a figure, not publishing the launch, not the nightly job.
**Who:** the client contact. Retainer clients only.

> **Subject:** Your The Freedom Experience launch tracker has been updated
>
> Bella,
>
> We've updated the launch tracker for The Freedom Experience (Bella Ltd) - there are newer figures in it than the last time you looked.
>
> See it here: https://aos.allegrostrategia.com/reporting/launches/…
>
> Team Allegro

**It's named after the offer, as you asked** — the offer linked to the launch, which is the name the client recognises. A launch with no offer linked to it falls back to the launch's own name, so that one would read "Your Autumn challenge launch tracker has been updated".

**One thing to look at:** with an offer whose name starts with "The", the subject reads "Your **The** Freedom Experience launch tracker has been updated". It's your sentence and it's built as written, but if that grates, dropping the "Your" — "The Freedom Experience launch tracker has been updated" — reads cleanly for every offer name. One word, say which.

This is the newest of the five and the one you've seen least. It exists because a launch's figures keep arriving for weeks after the cart shuts, and before this there was no way to say so without waiting for the monthly report.

---

## 5. The two monthly reminders

**When:** the 1st of the month, and again on the 8th only if the report still isn't finished. UK time. There is no third.
**Who:** aOS members reporting on themselves. Never a retainer client — they don't fill anything in — and never a cancelled member or a Chiarezza login past their end date.

**The 1st:**

> **Subject:** Time to fill in your September 2026 report
>
> Ruth,
>
> Time to fill in your report for September 2026 - note that although you don't have to fill in your report, this is what is going to really help you move forward in your business so as always, I suggest doing it asap!
>
> The more data you have, the more we can use it.
>
> Anything you want to bring up, you can add to your weekly roadmap check in on Friday.
>
> Your report: https://aos.allegrostrategia.com/reporting
>
> Nina x

**The 8th:**

> **Subject:** Don't forget your September 2026 report
>
> Ruth,
>
> Don't forget to fill in your monthly report for September 2026.
>
> As always, you don't have to fill this in, but I hugely suggest you do as this data is GOLDDUST for us being able to make changes together to grow your business!
>
> Your report: https://aos.allegrostrategia.com/reporting
>
> Nina x

**These two are the only emails in aOS that say "I".** They go to members, who know you, and they're signed "Nina x" where the three client emails are signed "Team Allegro" — which is how you wrote them, and it is the right line: a member hears from you, a client hears from the team.

---

## 6. The screen a client sees between months

Not an email. This is what a retainer client reads when they open a month that hasn't been published yet — which, since your decision 10, now appears in their month picker as soon as the month has finished.

> ### Your September 2026 report is being prepared
>
> Your Allegro team are still putting this month together. You'll be emailed as soon as it's ready to read, and your earlier months are all still here in the month picker!

It's the whole screen — no empty cards underneath it. There's a picture of it in the review pack at `screens-review/03-being-prepared-client`.

**It's the only thing a client reads in the gap between months**, so it's doing more work than its length suggests: it says somebody is working on it, that they don't need to chase, and that nothing has been lost.

---

## 7. Which figures reach "Look at these first 👀" — and the floors under it

Not an email, and not new wording: the eight sentences in the two panels are already yours, word for word. **What is new, from 1 November, is which figures get one** — and that is a set of numbers you can change, so it belongs on this list.

**How a figure is chosen.** Every monthly figure that has a good direction gets at most one sentence. If you have set it a target, the target is what the sentence is about. If you haven't, it's compared with last month. Each panel then shows the three biggest, and if a panel ends up with nothing it isn't shown at all.

**Why this needed a floor.** On the October test month, "Variable costs up £11" appeared under "Look at these first" beside two real problems — new clients at a fifth of target, and a list that had shrunk. £239 to £250 is a 4.6% move, and it was there only because the panel took the three biggest things it had rather than the things worth reading. A list of three where one matters teaches a client to skim all three.

So a move now has to clear **both** of these to be worth a sentence:

| | The floor | Why both |
| --- | --- | --- |
| **A share of last month** | 10% | Catches a small move on a big figure — £50 on £24,650. |
| **An amount, in the figure's own unit** | see below | Catches a big-looking percentage on a figure that is tiny — doubling £1. |

The amounts, one per kind of figure:

| Kind of figure | Has to move at least |
| --- | --- |
| Anything counted (clients, opt-ins, units sold) | 1 |
| A rate (%) | 1 percentage point |
| Money under £10 (cost per click) | 5p |
| Money under £1,000 (costs, a small offer's revenue) | £1 |
| Money of £1,000 or more (revenue, profit) | £100 |
| Hours | 2 hours |
| A ratio (ROAS, issues per 10 clients) | 0.1 |
| Months (runway) | half a month |

Money is split by size rather than by which figure it is, because there is no one amount that is small for all of it: £100 is nothing on £24,650 of revenue and it would silence a cost per click that went from 14p to 20p.

**And two rules about targets:**

- **A target missed by less than 5% is not a focus area.** At 97% of a target somebody very nearly did the thing, and reading about it under "Look at these first" is being told off for it.
- **A target beaten by less than 1% still gets its WOOOO.** Deliberately not the same number: a near miss on a list of jobs is a job you don't have, where a near win is a nice thing to read and costs nothing.

**What this changed on the test month.** "Variable costs up £11" is gone; the other two focus areas are exactly as they were, and "What went WELL this month" didn't change at all — all three of its lines clear the floors easily.

**All of it is in one place in the code**, next to your eight sentences, so any of these numbers can be changed on its own without touching a screen. If 10% is too strict and you'd rather hear about a 5% move, or £100 is too high for revenue, say the number and it's a one-line change.

---

## What still needs you

Three things, and only the first is urgent:

1. **The member invitation's two headings** (§1) — now that the subject says "Your Allegro login is ready", the member version says nearly the same thing again in its first line. Yours to decide; the subject itself is done.
2. **Two headings in a row** at the top of that same invitation (§1).
3. **"Your The Freedom Experience…"** in the launch subject (§4), if it grates.

Everything else on this page is built as you wrote it. If it's easier to say a change out loud than to write on this, that works too — none of it is hard to change, and none of it is in front of anybody yet.
