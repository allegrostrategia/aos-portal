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
- **Monthly draw, admin side (1 Sep):** `/admin/draw` — set up a draw, see every active member's count against the bar, lock the entrant list, draw the winner. Rules live in the database (`weeks_in_month`, `draw_eligibility`, `open_draw_entries`, `draw_winner`) rather than the panel, same as `activate_member`. **"A full month" is computed, not assumed** — four or five Mondays depending on the month, so a five-week month genuinely needs five complete weeks. Locking entries records `complete_weeks` on the entry, so editing time later can't change who was in a past draw, and `drawn_at is null` sits inside the UPDATE so a double-click can't produce a second winner. 18 new schema tests.

  **Migration applied to live on 1 Sep by pasting the single file into the SQL editor**, after `db push` couldn't authenticate (see bug 11). `migration repair` still owed for `20260901104500` — the schema is correct, but the CLI's history table doesn't know it, so the next `db push` will see it as pending. Harmless to re-run (all `create or replace` and grants), but worth clearing before a migration that isn't.

  **Verified by 11 tests driving the real Server Actions**, not just the SQL underneath — the Supabase client is translated onto PGlite with RLS still applied, so nothing in `src/` knows it's under test. That found two empty-state bugs the schema tests couldn't: with nobody eligible, the panel claimed everyone was already entered, and told Nina to open entries she had just opened. Still unproven: the page's own rendering, and anything that would show up only as drift between the pasted migration and the repo.

  Also closed a pre-existing leak while in here: `complete_weeks_in_month` was `security definer` with a member-id argument and no access check, so any signed-in member could ask it about anyone else. Now "yourself, or an admin".

## What's built but not yet delivered/wired
- **Reminders and hot seat emails work end to end** — genuinely tested today with real delivery to a real inbox. `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM` are confirmed set in Vercel. (A fresh Claude Code session guessed these were unset on 31 Aug — that was wrong, it has no way to actually see Vercel's dashboard. Trust the tested reality over a session's inference here.)

## Genuinely still open, in priority order
1. **Rest of Step 8** — hot seat challenge review refinements. The monthly draw is built (above) and needs `db:push` plus a run-through on live.
2. **Steps 9-13** — handover pack + AI SOP generator, gamification/hours-reclaimed ledger, chat (including voice messages)/peer pairing/directory, the roadmap reveal generator, final polish. None started.

## Known, unfixed, and will look alarming
- **`npm run test:db` shows 64 passed, 1 failed on some days.** `create_member accepts the named parameters the app sends` computes its expected date in JS with `setMonth(+6)`, which overflows where Postgres clamps: run on 31 Aug, JS says 2027-03-03 and Postgres correctly says 2027-02-28. **The test is wrong, not the schema.** It only fails on days whose day-of-month doesn't exist six months later — the 29th to 31st of Aug, Oct, Dec, Mar, May, Jul — and passes on its own the next day, which is the worst version of a flaky test. Fix is to do the date arithmetic the way Postgres does rather than trusting `setMonth`.

## Deliberately not built yet, so it doesn't read as missed
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
13. A flaky test hiding behind `&&` — `recording a visit creates it, then increments` asserted two `now()` calls differ, but `now()` is the transaction clock and PGlite takes it from JS, so fast calls share a millisecond. It failed **6 runs in 12 on untouched code** while being quoted as "83 passing" off lucky single runs, and its position in `test:db` meant a coin-toss failure stopped the action suite running at all. Now asserts what the behaviour actually is

## Environment variables confirmed set in Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`. **`ANTHROPIC_API_KEY` deliberately unset** pending Nina's decision on AI drafting — see the section above before adding it.

## Nina's outstanding action items (unchanged, still real)
- The actual multiple-choice audit questions and answers
- The welcome session recording
- Priming content copy (the three onboarding drip pieces)
- Confirming Resend deliverability isn't landing in spam long-term

## Right now, exactly
Steps 1-7 are done, and admin content upload — the thing that was blocking Nina loading real content — is built, tested against live storage and pushed. The library is now usable end to end without touching Supabase's dashboard.

Next real piece of work: the hot seat challenge review, which is the last of Step 8. The monthly draw is built and waiting on `db:push` and a live run-through. Neither touches AI drafting, so neither waits on Nina.

Step 9 is only partly available: the handover pack itself and manual SOP addition are fine, the AI SOP generator is not. Worth taking Step 8 first rather than starting Step 9 and stopping halfway through it.

