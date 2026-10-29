# Every word a client or member reads

Nina — this is the full text of everything the reporting tool sends or shows that isn't a figure. Nothing here has been changed; it's set out so you can mark it up.

Each one says **when it goes out** and **who gets it**, then the email exactly as it arrives. The name, the month, the business and the launch are filled in per person; below they are shown with the test data, so "Bella", "Bella Ltd", "August 2026" and "Autumn challenge" are where a real one would be.

Emails are plain text, one blank line between paragraphs, no header image and no footer beyond the sign-off. That's deliberate: these are notifications, not newsletters.

**None of them carries a figure.** Not one number from the report goes in an email — a number in an inbox outlives its correction, and an email that can be read without signing in is a report that has stopped being private.

---

## 1. The invitation to a new reporting client

**When:** the moment you add a client in the admin panel. It's the first thing they ever receive from aOS.
**Who:** the client contact you named.

**This one lives in the Supabase dashboard rather than in our code** — Authentication → Emails → Invite user. So it's the only email on this list that can be changed without a deploy, and the only one nobody has watched arrive.

Here it is, exactly as configured today:

> **Subject:** You've been invited
>
> ## You've been invited
>
> You've been invited to create an account. Follow the link below to accept.
>
> [Accept invitation]

The link takes them to a page to set a password, and from there to their report.

**Two things to notice, and both are yours to decide:**

**It doesn't say who it's from, or what for.** The body is Supabase's default wording — the subject has never been changed, and the body only as far as fixing the link. There's no mention of Allegro Strategia, no mention of a report, and nothing to tell someone who has been expecting a call from you that this is that. It arrives as "You've been invited" from a name they may not recognise.

**The sender's name is misspelt.** Every auth email goes out as:

> **Allegro Stategia** &lt;noreply@allegrostrategia.com&gt;

"Stategia", missing the *r*. The address is right; the display name is not, and it's the first thing anybody sees in their inbox. It's one field in the Supabase dashboard — Dom can fix it in a minute, and it needs no deploy.

**Worth doing before the first real client:** send yourself one and read what arrives.

---

## 2. "Your report is ready"

**When:** the moment you press Publish on a month, the first time that month goes out.
**Who:** the client contact. Never a team member, and never an aOS member reporting on themselves.

> **Subject:** Your August 2026 report is ready
>
> Bella,
>
> Your August 2026 report for Bella Ltd is ready to read.
>
> It covers where the month went, what we make of it, and what we're focusing on next.
>
> Read it here: https://aos.allegrostrategia.com/reporting?workspace=…&month=2026-08
>
> If anything in it needs a conversation, you can reply underneath the report itself and we'll pick it up there.
>
> Allegro Strategia

The first line is their name as you typed it on the grant. If there's no name on it, that line reads `Hello,`.

---

## 3. "Your report has been updated"

**When:** you press Publish again on a month that has already gone out — after unpublishing it, correcting something, and republishing.
**Who:** the same client contact.

> **Subject:** Your August 2026 report has been updated
>
> Bella,
>
> We've updated your August 2026 report for Bella Ltd. Something in it needed correcting, so the version you read before isn't the current one.
>
> The updated report: https://aos.allegrostrategia.com/reporting?workspace=…&month=2026-08
>
> Do reply underneath it if you'd like to go through what changed.
>
> Allegro Strategia

This exists because of your own decision of 5 October: a client reading a changed figure should know it changed. The alternative is staying quiet about a number they've already acted on.

---

## 4. "Your launch tracker has been updated"

**When:** only when you press **Send update to client** on a published launch. Nothing else sends it — not saving a figure, not publishing the launch, not the nightly job.
**Who:** the client contact. Retainer clients only.

> **Subject:** Your Autumn challenge tracker has been updated
>
> Bella,
>
> We've updated the launch tracker for Autumn challenge (Bella Ltd) — there are newer figures in it than the last time you looked.
>
> See it here: https://aos.allegrostrategia.com/reporting/launches/…
>
> If anything in it needs a conversation, do say and we'll pick it up.
>
> Allegro Strategia

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
> Time to fill in your report for September 2026.
>
> Your report: https://aos.allegrostrategia.com/reporting

**The 8th:**

> **Subject:** Don't forget your September 2026 report
>
> Ruth,
>
> Don't forget to fill in your monthly report for September 2026.
>
> Your report: https://aos.allegrostrategia.com/reporting

**These two are already yours.** The wording is taken verbatim from your brief — only the greeting and the link were added, which every email here carries. The other three were written for you.

---

## 6. The screen a client sees between months

Not an email. This is what a retainer client reads when they open a month that hasn't been published yet — which, since your decision 10, now appears in their month picker as soon as the month has finished.

> ### Your September 2026 report is being prepared
>
> Your strategist is still putting this month together. You'll be emailed as soon as it's ready to read, and your earlier months are all still here in the month picker.

It's the whole screen — no empty cards underneath it. There's a picture of it in the review pack at `screens-review/03-being-prepared-client`.

**It's the only thing a client reads in the gap between months**, so it's doing more work than its length suggests: it says somebody is working on it, that they don't need to chase, and that nothing has been lost.

---

## What to mark up

Anything at all. The four written-for-you emails (1, 2, 3, 4) and the screen at 6 have had no eyes but ours. The two reminders at 5 are your own words and probably need nothing.

If it's easier to say it out loud than to write on this, that works too — none of it is hard to change, and none of it is in front of anybody yet.
