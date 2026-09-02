# aOS — current state (31 August 2026)
*If this chat ever needs to hand off to a fresh one: drop in this file plus `CLAUDE.md`, the Build Brief, the Training Library doc, and whatever the latest Dom Build Plan looks like (that file is now owned by Claude Code directly, not maintained here). This document is the "where we actually left off," not the full spec.*

**Now committed into `docs/` in the repo** (31 Aug), which is what makes it findable at all — for a while it existed only in chat, and a fresh session that went looking for it couldn't find it and reconstructed state from git log instead. Keep it committed, and keep it updated in the same commit as the work it describes.

## What's genuinely built and live, right now
- **Infrastructure:** Supabase, GitHub, Vercel, all connected, `aos.allegrostrategia.com` live.
- **Step 1 (schema, auth, RLS):** Done and verified against the live database. Full member lifecycle, all tables and RLS tested.
- **Step 2 (design system):** Done.
- **Step 3 (onboarding):** Done. Welcome session gate, audit form (placeholder questions — real ones still needed from Nina), itinerary, directory listing, admin audit view.
- **Step 4 (Piazza + La Strada):** Done. Piazza shows only widgets with real data behind them, nothing hollow. **La Strada's map is genuinely finished** — real coastline artwork, bucket-coloured lines (gold/sky/orange/deep red, "Your Story" unlined), photo markers using the real station images, greyscale until visited, visits recorded on page render so deep links count same as walking there. Native scroll/pan, not a custom gesture layer.
- **Step 5 (weekly log/timer):** Done. Server-derived elapsed time, category tracking, optional notes field, reminder cadence live via the `due_jobs` scheduler.
- **Step 6 (hot seat):** Done, fully. Scheduling, submission, prep-and-confirm, both reminder tracks (submission + attendance), Friday touchpoint view, reminder preview page (no need to send real email to check copy). Two real bugs found and fixed: a timezone split between storage and display, and reminders not auto-resetting when a session's rescheduled.
- **Step 7 (training library):** Done. Admin content management with full tagging, station pages showing content grouped by kind, private `training-content` bucket with no member-level policy at all (everything routes through a signed-URL endpoint that checks RLS directly), viewer with streaming/embedded playback. Spreadsheets are the one agreed exception — they download, everything else streams.
- **Admin content upload (31 Aug):** Done, tested end to end against live storage — real video uploaded, published, played back as a member. The file goes browser-straight-to-storage via a signed upload URL, because a Server Action body is capped at a few MB on Vercel and the trainings are videos; the server only decides who may upload and where it lands, so nothing can be written outside a station prefix. Format is read from the file's extension (browsers disagree about MIME types for .m4a and .csv), and replacing or deleting content now removes the old object rather than stranding it. §11 unchanged: bucket still has no member policy, reads still only through `/api/content/[id]`.
- **Video player sizing (31 Aug):** Player sizes itself to the video's real aspect ratio rather than letting width win unconditionally — a phone-recorded 1080x1920 training was rendering full-column-width and ~1365 tall, off the bottom of the screen. Confirmed on mobile and desktop.
- **Admin lifecycle controls:** Activate/cancel/reinstate, roadmap editor with preserved item IDs, current focus correctly read-only (populated only via hot seat confirm).

## Built, not yet run against the live database
- **Chat schema (1 Sep):** Step 11's foundation. Three open channels (general / wins / time-tracking) plus direct messages, voice messages alongside text, and — from the first line rather than retrofitted — `handover_pack_id` on every message so a two-week check-in response attaches to the build it's about, and `testimonial_consent` per response, off by default, with a constraint making consent impossible without a build to consent *about*. `open_direct_channel()` finds-or-creates atomically, so two people clicking "chat" at once can't split the conversation into two channels. Chat is open to onboarding members: §1 locks the library, hot seat, pairing and the draw, not Piazza Sociale. **No update or delete policy** — a sent message is sent, matching the voice bucket's existing rule; deliberate, and easy to relax if it proves too strict. 17 tests, mutation-checked.

  **Applied to live on 1 Sep** along with the hours-reclaimed migration, both by pasting the single file into the SQL editor. `migration repair` still owed for all three of the day's migrations.

- **Realtime + unread email notification (1 Sep):** Two mechanisms, because neither covers the other's case — Realtime for anyone with the conversation open, email for the multi-day gap the Friday/Monday touchpoint actually has. New `chat_reads` table (a timestamp per member per channel, not a flag per message), `mark_channel_read()` that only ever moves forward, and a `chat_unread` job.

  **Direct messages only.** Emailing every member about every post in General an hour later is the inbox-clogging this was meant to avoid. One email per unread run, not per message: the dedupe key is the *oldest* unread message, so a burst sends one email and no backlog is ever notified twice. Re-checked at send time, so reading the conversation first cancels it.

  **Delivery is once daily, and that's a decision, not a gap (1 Sep).** `vercel.json` runs `/api/cron/due-jobs` at `0 8 * * *`, so a notification queued at 14:00 goes out the following morning. Dom's call: people check chat on their own regardless, and it isn't worth Vercel Pro or an external pinger. **Don't "fix" this by adding a sub-daily cron** — the two thresholds do different jobs and both still work: the one-hour gate decides *whether* a message is worth notifying about at all (so nothing is queued during live back-and-forth), and the daily send decides when it lands. `due_jobs.due_at` exists and the runner honours it, so a finer cadence is a `vercel.json` change and nothing else, if it's ever wanted.

  **Fifth migration**, and the realtime publication line is guarded so `test:db` still runs.

- **Chat UI and voice playback (1 Sep):** `/sociale` and `/sociale/[channel]` — the three open channels, direct messages, a thread view and a composer that records voice notes with `MediaRecorder` and uploads them straight to storage. Playback goes through `/api/voice/[messageId]`, which reads the message with the *member's own session* so `chat_messages`' RLS decides who may hear it, then signs a short-lived URL with the service role. That closes the gap the August storage migration flagged in its own comment: the bucket's policies only let a sender read their own folder, which is right for uploads and useless for playback. 9 action tests, mutation-checked.
- **Hours reclaimed — the ledger (1 Sep):** Step 10's core. Two tables, because §2's shape is the point: a **dated rate history** per build (`effective_from`/`effective_until`), and an **append-only weekly ledger**. Retiring a build that ran six months closes its period and leaves every week it earned untouched — a live recalculation would have erased six months of banked hours and shown a member their headline number falling. Accrual runs off the existing `due_jobs` cron, replans the last four weeks daily so an outage self-heals, and is idempotent on `(member, week)`.

  **Two gates, and they are not the same gate:** the week must clear ten hours *and* the log must have been submitted. That's the literal reading of §2, which states them as separate bullets — it means tracking twelve hours and forgetting to submit earns nothing. Deliberate, but **worth Nina confirming out loud**, since it's members' real hours.

  Admin can add a build and set/revise/retire its rate on the member page. 21 new schema tests, all mutation-checked.

  **Ships a migration.** Third one now waiting on live.
- **Hot seat challenge review (1 Sep):** Completes Step 8. The prep sheet now lists **every active member, not every submission** — a member who never submitted had no row and so couldn't be prepped at all, which made §5's own fallback ("work from whatever their tracked data shows as the biggest time-block") unreachable for exactly the people it was written for. Locking a challenge creates their row. Their biggest time block is surfaced as evidence rather than written up as a suggestion: nothing here generates text, which matters while AI drafting is on hold. Attendance recording and the replay note also added — both were columns nothing wrote. 13 action tests.

  **Ships a migration** (`20260901171500_draw_excludes_admins.sql`) — see the admin-in-the-draw bug below. Needs applying the same way as the last one.
- **Monthly draw, admin side (1 Sep):** `/admin/draw` — set up a draw, see every active member's count against the bar, lock the entrant list, draw the winner. Rules live in the database (`weeks_in_month`, `draw_eligibility`, `open_draw_entries`, `draw_winner`) rather than the panel, same as `activate_member`. **"A full month" is computed, not assumed** — four or five Mondays depending on the month, so a five-week month genuinely needs five complete weeks. Locking entries records `complete_weeks` on the entry, so editing time later can't change who was in a past draw, and `drawn_at is null` sits inside the UPDATE so a double-click can't produce a second winner. 18 new schema tests.

  **Migration applied to live on 1 Sep by pasting the single file into the SQL editor**, after `db push` couldn't authenticate (see bug 11). `migration repair` still owed for `20260901104500` — the schema is correct, but the CLI's history table doesn't know it, so the next `db push` will see it as pending. Harmless to re-run (all `create or replace` and grants), but worth clearing before a migration that isn't.

  **Verified by 11 tests driving the real Server Actions**, not just the SQL underneath — the Supabase client is translated onto PGlite with RLS still applied, so nothing in `src/` knows it's under test. That found two empty-state bugs the schema tests couldn't: with nobody eligible, the panel claimed everyone was already entered, and told Nina to open entries she had just opened. Still unproven: the page's own rendering, and anything that would show up only as drift between the pasted migration and the repo.

  Also closed a pre-existing leak while in here: `complete_weeks_in_month` was `security definer` with a member-id argument and no access check, so any signed-in member could ask it about anyone else. Now "yourself, or an admin".

## What's built but not yet delivered/wired
- **Reminders and hot seat emails work end to end** — genuinely tested today with real delivery to a real inbox. `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM` are confirmed set in Vercel. (A fresh Claude Code session guessed these were unset on 31 Aug — that was wrong, it has no way to actually see Vercel's dashboard. Trust the tested reality over a session's inference here.)

## Genuinely still open, in priority order
1. **Step 8 is complete** — content upload, the monthly draw and the hot seat challenge review are all built. Two migrations are waiting to be applied to live, and the whole of Step 8 needs a run-through there.
2. **Steps 9-13** — handover pack + AI SOP generator, gamification/hours-reclaimed ledger, chat (including voice messages)/peer pairing/directory, the roadmap reveal generator, final polish. None started.

## Known, unfixed, and will look alarming
- **`npm run test:db` shows 64 passed, 1 failed on some days.** `create_member accepts the named parameters the app sends` computes its expected date in JS with `setMonth(+6)`, which overflows where Postgres clamps: run on 31 Aug, JS says 2027-03-03 and Postgres correctly says 2027-02-28. **The test is wrong, not the schema.** It only fails on days whose day-of-month doesn't exist six months later — the 29th to 31st of Aug, Oct, Dec, Mar, May, Jul — and passes on its own the next day, which is the worst version of a flaky test. Fix is to do the date arithmetic the way Postgres does rather than trusting `setMonth`.

## Deliberately not built yet, so it doesn't read as missed
- **§2's collective community goal.** The brief asks for the community number beside the personal one but never says what it counts *towards*. The total is computable; the target needs Nina. A made-up threshold shown to members as if it meant something is worse than waiting.
- **The member directory (§10).** `display_names()` now exists and is the right source for any screen showing another member's name. `member_profiles` exists and members fill theirs in during onboarding, but there's no browse or search screen and no "chat" button through to a DM. `/sociale` names it as still to come rather than leaving a hole.
- **Peer pairing (§9).** Tables exist from Step 1; availability submission, rotation matching and the day-7 flag to Nina are unbuilt.
- **The full handover pack (Step 9).** Adding a build with a rate is a deliberately small slice of Step 9's territory, built only because Step 10 cannot function without it — nothing accrues until a rated build exists. The write-up, the member's own edit and export are all still unbuilt.
- **The Piazza proof cluster shows only once there are hours.** "0 hrs reclaimed" every morning during a member's first weeks is worse than nothing.
- **The member-facing draw card** (Piazza compact card + raffle-ticket click-through, §2) is Step 10 with the rest of gamification, not part of the admin work done on 1 Sep. Note it needs something the current RLS doesn't give it: members can read `draws`, but `winner_member_id` is only a uuid to them, and RLS stops a member resolving another member's name. Showing "X won" needs a deliberate decision about exposing winner names, not just a query.

## AI drafting is under review — do not wire it (1 Sep)
**Nina is reconsidering whether to use AI drafting at all. `ANTHROPIC_API_KEY` is deliberately not set, and must not be wired until she decides.**

The hot seat prep panel stays exactly as it is — empty, with Nina confirming manually. That is the proven working state from 31 Aug's testing, **not an unfinished feature**: a session that "fixes" the empty panel by wiring a Claude call is undoing a live decision.

The question is broader than the hot seat and reaches three places, so it's worth having her full view before any of them are built rather than deciding it three times:
- The hot seat prep suggestion (panel built, waiting)
- Step 9's AI SOP generator
- Step 12's roadmap reveal document generator

Note this is a question about *whether* AI is used in these spots, not about the "AI drafts, human confirms" rule — that rule governs how it works if it's used, and stands either way.

## Two decisions waiting on Nina specifically
- The two-week check-in's full definition (fires per-build, in chat, member reports, Nina decides on retiring the rate) — needed before Step 10's ledger can close a rate properly.
- Confirm the spreadsheet-download exception is genuinely fine as a standing rule (already leaning yes, worth an explicit sign-off).

## A session-management lesson worth keeping
Today's Claude Code session ran for a very long time (Steps 1 through 7, in one sitting) and eventually hit real limits — auto-compaction happened twice, then messages started failing with "prompt too long" even when tiny, which turned out to trace back to an expired OAuth session, not message size. **Lesson: for a build this size, start a fresh Claude Code session per major step or per day, not one continuous marathon session.** Point it at `CLAUDE.md` and this file each time, rather than relying on one session to hold the whole project's memory indefinitely.

## Real bugs found and fixed (running list, worth knowing the shape of each)
1. Vercel Authentication toggle blocking public site access
2. `supabase link` CLI bug — worked around via direct connection string
3. Eight queries missing explicit member scoping (relied on RLS alone) — now a standing `CLAUDE.md` rule
4. Roadmap published to wrong account (same root cause as #3, plus account-naming confusion)
5. Hot seat session query assumed "week one" as a rule rather than reading the real `scheduled_for` date
6. Timezone split between how session times were stored vs displayed (storage read UTC, one display path read UTC, emails pinned London — fixed by pinning everything to one shared module)
7. Reminders not auto-invalidating when a session's rescheduled — fixed by clearing `due_jobs` for that session whenever its time changes
8. Vercel deploys not triggering automatically from git push (happened twice) — worked around via manual deployment trigger from a specific commit SHA
9. Video player assuming landscape — vertical phone-recorded video rendered full-column-width and taller than the viewport, controls off-screen. Fixed by bounding both axes and letting the file's own aspect ratio decide, rather than storing dimensions
10. Work reported as "done" while sitting uncommitted in the working tree — the deployed site was correctly serving older code and looked like a bug in the feature. **Building it and shipping it are two separate things; say which one has actually happened**
11. Session pooler rejecting three freshly-reset passwords with `28P01` — the pooler username must be `postgres.<ref>`, not `postgres`, and a bare `postgres` fails as a *password* error. Cost an afternoon. Now written up in the README's connection section
12. `npm run db:bundle` nearly pasted over a live schema — it emits **every** migration, which is a bootstrap tool, not a way to apply one pending migration. For a single migration, paste that one file and repair only its version. Also in the README now
13. **`members` is readable only by its owner, so joining it for a name returns null** — chat labelled everyone "A member", and the same root cause was flagged for the member-facing draw winner this morning and not connected to chat when it was built. `display_names()` now resolves names for anyone with portal access: a completed directory listing first, the account name as fallback. A function rather than a policy because RLS is row-level — letting members read each other's names would hand over email, status and contract terms with it. **The pattern to remember: a name that renders as "A member" is a policy doing its job, not missing data**
14. **A test that passed for the wrong reason** — "a rate that starts after the week doesn't count" never had a rate starting after the week; the `effective_until` clause alone carried it. Found by mutation testing: deleting the start-date check broke nothing. The test now sets a genuinely future-dated rate. **A green test is not evidence until it's been seen to fail**
15. **The admin is also an active member** — `draw_eligibility()` and the new hot seat prep sheet both filtered on `status = 'active'` alone, which put Nina on her own prep sheet every month and in the hat for a prize she gives away. `role = 'member'` is the distinction, as `lib/jobs/runner.ts` already had it. Caught by a test, not by looking
16. A flaky test hiding behind `&&` — `recording a visit creates it, then increments` asserted two `now()` calls differ, but `now()` is the transaction clock and PGlite takes it from JS, so fast calls share a millisecond. It failed **6 runs in 12 on untouched code** while being quoted as "83 passing" off lucky single runs, and its position in `test:db` meant a coin-toss failure stopped the action suite running at all. Now asserts what the behaviour actually is

## Environment variables confirmed set in Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`. **`ANTHROPIC_API_KEY` deliberately unset** pending Nina's decision on AI drafting — see the section above before adding it.

## Nina's outstanding action items (unchanged, still real)
- The actual multiple-choice audit questions and answers
- The welcome session recording
- Priming content copy (the three onboarding drip pieces)
- Confirming Resend deliverability isn't landing in spam long-term

## Right now, exactly
Steps 1-7 are done, and admin content upload — the thing that was blocking Nina loading real content — is built, tested against live storage and pushed. The library is now usable end to end without touching Supabase's dashboard.

Step 8 and the core of Step 10 are done. Remaining Step 10: the illustrated milestone path click-through, and the community goal once Nina sets a target. Next real piece of work after that is Step 9 — the handover pack, which is available; its AI SOP generator is not, pending Nina's decision. Worth deciding whether to start Step 9 knowing half of it is blocked, or take Step 10's hours-reclaimed ledger instead, which is fully unblocked and is what the whole "one real thing built live" promise is measured by.

Step 9 is only partly available: the handover pack itself and manual SOP addition are fine, the AI SOP generator is not. Worth taking Step 8 first rather than starting Step 9 and stopping halfway through it.

