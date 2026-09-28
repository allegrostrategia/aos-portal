# aOS — Round 6: Check-in Nudges, Prize & Chat Redesign

Compiled from Nina's notes. One thing to flag back rather than assume — marked below. Everything else is build-ready as written.

## 1. Friday check-in nudge

**What:** every Friday, a notification (push + email) reminding members to do their check-in ahead of Monday's roadmap Q&A.

**Reading "check-in" as:** the Weekly Check-Ins room already built in Sociale (Mondays 2–3:30pm UK) — this is a heads-up before that window opens, not a new form or screen. **Flag — confirm this is right**, because if Nina actually meant a separate written submission, that's a different build.

**Suggested copy:**
> Your weekly check-in is open Monday, 2–3:30pm — pop your update into Sociale before then so it's ready for the roadmap Q&A.

**Who gets it:** every active member, every Friday, regardless of last week's activity — a routine heads-up, not a response to inactivity (that's #2, below).

**Build note:** fits the existing daily cron (`due_jobs`, 08:00 UTC) the same way every other scheduled notification already runs — just a Friday-only job added to that pattern.

## 2. Roadmap inactivity nudge

**What:** if a member hasn't opened or interacted with La Strada for 7 days, they get a reminder.

**Copy:**
> Just a reminder to come and check in on your roadmap — we noticed you haven't been in for about a week. If you're just having a busy week, no worries, ignore this one and we'll check back in with you next week. But if something's changed since your roadmap was built, let us know in your weekly check-in so we can make it accurate for you again.

**Trigger:** last La Strada interaction more than 7 days ago. Re-sends once a week for as long as the member stays inactive, and stops the moment they open La Strada again.

## 3. This month's prize — the real threshold, confirmed

**Keep:** the existing copy — *"one asset, built by Nina: your choice of a single email, landing page, or template, done for you."* Already written, nothing new to design.

**Qualifying bar: 10 hours logged in any single week that month.** This isn't a new decision — it's what the reminder emails already tell real members ("Ten-hour weeks are what put you in the monthly prize draw"), discovered live in `/admin/reminders`. It doesn't match the old mock ("a full month of logs"), so go with what's actually shipped: wire the Piazza dashboard card to this same rule.

## 4. Sociale — the WhatsApp review

- **No wallpaper behind the thread.** Add a subtle Amalfi Coast/Italian coastline image, muted and desaturated so it sits behind the bubbles without fighting the text — fits the Italian theming already running through the app (Piazza, Sociale, Archivio, La Strada).
- **No avatars.** Add each member's profile photo next to their name on their own messages, with an initials-on-solid-colour fallback for anyone without one uploaded.
- **Every message repeats the name and avatar.** Group consecutive messages from the same sender — show the name and avatar once, not per message.
- **No clear "mine vs theirs" split.** Own messages sit on the right in the brand colour; everyone else's sit on the left in a neutral tone.
- **Square-ish bubbles.** Round the corners properly and give each bubble a small tail pointing toward its sender.
