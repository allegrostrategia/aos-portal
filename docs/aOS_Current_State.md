# aOS — current state (31 August 2026)
*If this chat ever needs to hand off to a fresh one: drop in this file plus `CLAUDE.md`, the Build Brief, the Training Library doc, and whatever the latest Dom Build Plan looks like (that file is now owned by Claude Code directly, not maintained here). This document is the "where we actually left off," not the full spec.*

**Important:** this file needs to actually be committed into `docs/` in the repo, not just exist in this chat — a fresh Claude Code session has no way to find it otherwise. If you're reading this because a session went looking for it and couldn't find it, that's exactly the gap this note is fixing.

## What's genuinely built and live, right now
- **Infrastructure:** Supabase, GitHub, Vercel, all connected, `aos.allegrostrategia.com` live.
- **Step 1 (schema, auth, RLS):** Done and verified against the live database. Full member lifecycle, all tables and RLS tested.
- **Step 2 (design system):** Done.
- **Step 3 (onboarding):** Done. Welcome session gate, audit form (placeholder questions — real ones still needed from Nina), itinerary, directory listing, admin audit view.
- **Step 4 (Piazza + La Strada):** Done. Piazza shows only widgets with real data behind them, nothing hollow. **La Strada's map is genuinely finished** — real coastline artwork, bucket-coloured lines (gold/sky/orange/deep red, "Your Story" unlined), photo markers using the real station images, greyscale until visited, visits recorded on page render so deep links count same as walking there. Native scroll/pan, not a custom gesture layer.
- **Step 5 (weekly log/timer):** Done. Server-derived elapsed time, category tracking, optional notes field, reminder cadence live via the `due_jobs` scheduler.
- **Step 6 (hot seat):** Done, fully. Scheduling, submission, prep-and-confirm, both reminder tracks (submission + attendance), Friday touchpoint view, reminder preview page (no need to send real email to check copy). Two real bugs found and fixed: a timezone split between storage and display, and reminders not auto-resetting when a session's rescheduled.
- **Step 7 (training library):** Done. Admin content management with full tagging, station pages showing content grouped by kind, private `training-content` bucket with no member-level policy at all (everything routes through a signed-URL endpoint that checks RLS directly), viewer with streaming/embedded playback. Spreadsheets are the one agreed exception — they download, everything else streams.
- **Admin lifecycle controls:** Activate/cancel/reinstate, roadmap editor with preserved item IDs, current focus correctly read-only (populated only via hot seat confirm).

## What's built but not yet delivered/wired
- **Reminders and hot seat emails work end to end** — genuinely tested today with real delivery to a real inbox. `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM` are confirmed set in Vercel. (A fresh Claude Code session guessed these were unset on 31 Aug — that was wrong, it has no way to actually see Vercel's dashboard. Trust the tested reality over a session's inference here.)

## Genuinely still open, in priority order
1. **Admin content upload** — biggest live friction. `asset_path` is currently typed by hand; files go into the bucket manually via Supabase's own dashboard first. Signed-upload architecture already agreed (browser uploads straight to storage, server only issues permission) — just not built yet.
2. **`ANTHROPIC_API_KEY`** — still not added to Vercel. Blocks the Claude-drafted hot seat suggestion; the prep sheet already has the panel waiting for it.
3. **Rest of Step 8** — hot seat challenge review refinements, running the monthly draw.
4. **Steps 9-13** — handover pack + AI SOP generator, gamification/hours-reclaimed ledger, chat (including voice messages)/peer pairing/directory, the roadmap reveal generator, final polish. None started.

## Scoped but deliberately not built: true push notifications
Scoped on 1 Sep, deferred to its own session by decision, not oversight. What it needs: service worker, VAPID keys (3 new Vercel env vars), a per-device `push_subscriptions` table, permission UX, and iOS home-screen guidance.

Three things worth keeping from the scoping:
- **The "short buffer for rapid messages" doesn't need a scheduler.** A per-(member, channel) cooldown — push immediately, then suppress for N minutes — gives the same visible result with no cron change, and Next 16's `after()` sends it without adding latency to hitting Send. This matters because a buffer would otherwise reintroduce the sub-daily cron that was deliberately declined.
- **Notification text should not quote the message**, matching the decision already made for the unread email: a banner on a lock screen is the same exposure.
- **The testing story is much weaker than everything else here.** Service workers, permission prompts and real delivery can't be tested in this harness at all, and notification permission is one-shot per device — deny it once and you cannot ask again. Needs a physical iPhone; the simulator doesn't do push properly.

Push likely **complements** the unread email rather than replacing it, since most iOS members won't install to the home screen.

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

## Environment variables confirmed set in Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`. **Still needed:** `ANTHROPIC_API_KEY`.

## Nina's outstanding action items (unchanged, still real)
- The actual multiple-choice audit questions and answers
- The welcome session recording
- Priming content copy (the three onboarding drip pieces)
- Confirming Resend deliverability isn't landing in spam long-term

## Right now, exactly
**Session closed cleanly here.** Step 11's core is genuinely done and tested: chat schema, UI, voice recording and playback (confirmed end to end after being described-but-unproven for several hours — worth remembering that gap can happen even with good intentions, hence the standing testing rule below), Realtime live-updating, read state, the unread email notification, and member name resolution (fixed via a narrow security-definer function returning only names, not a broader RLS policy, to avoid leaking email/status/contract data alongside it).

**Step 11 remaining, in order:** the member directory (small, natural next piece — `member_profiles` and `display_names()` already exist, just needs a browse/search screen and a chat-through button) and peer pairing (tables exist from Step 1, availability/rotation/day-7-flag logic unbuilt).

**Not started:** Step 12 (roadmap reveal generator — fully AI-dependent, paused) and Step 13 (final polish).

**Standing rule, worth repeating because it was nearly broken tonight: always confirm real testing is complete — actually done, not just described as done — before telling Claude Code to commit/push.**

**Six migrations pasted directly via SQL Editor today, not through the CLI** — the Supabase pooler connection genuinely never got fixed, only worked around. Root cause remains genuinely unknown; documented in the README as an open mystery. `migration repair` owed for all six once/if the pooler connection ever actually works — safe to keep deferring, each migration is idempotent or purely additive.

**Three notes in this doc are decisions, not gaps — do not "fix" them:** AI drafting paused pending Nina's decision, notification cadence staying daily (Hobby plan limit, and Nina's confirmed she's fine with that), and the community goal's target is undefined pending Nina.

**To pick this up fresh: `CLAUDE.md` + this file, nothing else needed.**


