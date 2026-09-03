# aOS — current state (3 September 2026)
*If this chat ever needs to hand off to a fresh one: drop in this file plus `CLAUDE.md`, the Build Brief, the Training Library doc, and whatever the latest Dom Build Plan looks like (that file is now owned by Claude Code directly, not maintained here). This document is the "where we actually left off," not the full spec.*

> **Editing note (3 Sep):** several updates to this file between 1–3 Sep were reported as made and silently weren't — the edit scripts used string replacement without checking the target matched, so a stale anchor printed success and changed nothing. This file was rebuilt from the git log on 3 Sep. **Assert the anchor exists before editing this file, or rewrite it whole.**

## What's genuinely built and live
- **Infrastructure:** Supabase, GitHub, Vercel, all connected, `aos.allegrostrategia.com` live.
- **Steps 1–7:** schema/auth/RLS, design system, onboarding, Piazza + La Strada, weekly log/timer, hot seat, training library. All verified against the live database. Audit questions are still placeholders pending Nina.
- **Step 8 (admin panel) — complete.** Member lifecycle, roadmap editor, **content upload** (browser-straight-to-storage via signed URL — a Server Action body can't carry a video), **the monthly draw**, and **hot seat challenge review** (the prep sheet lists every active member, not just those who submitted — §5's fallback was unreachable otherwise).
- **Step 10 core — the hours-reclaimed ledger.** Dated rate history per build plus an append-only weekly ledger, so retiring a build never shrinks hours already banked. Accrual runs off `due_jobs`, replans four weeks back daily, idempotent on (member, week). **Two gates, both required and both settled: ten hours logged AND the log submitted.**
- **Step 11 — complete and verified live.** Chat (channels, DMs, voice notes through a signed-URL route, Realtime, read state, unread email), the member directory (search, listings, chat-through button), and peer pairing (availability grid, rotation matcher, both notification emails, day-7 flag, coach branch).
- **Installable to the home screen.** Manifest, real brand icons, and an install prompt — a button where the browser supports it, Share → Add to Home Screen on iOS, which has no install API at all. Confirmed on a real iPhone.

## Verified live, by hand, with real accounts and real email
- Library upload → publish → playback as a member.
- Voice note recording and playback, **as the recipient** (the sender could always read their own folder, so testing as yourself proves nothing).
- Realtime live updates, name resolution, directory search, opening a DM from a listing.
- Peer pairing end to end, including **the day-7 guard in both directions**: with `met_at` set it skipped and left `flagged_at` null (checked on the row, not the summary count); with `met_at` cleared it sent and set the flag. A handler that never sent anything would have passed the skip test alone.

## Genuinely still open
1. **The two-week check-in** — confirmed, defined, and the thing that closes Step 10's loop. See below.
2. **Step 9 — the handover pack.** The write-up, the member's own edit and export are unbuilt. Adding a build with a rate exists only because Step 10 needed it. The AI SOP generator is blocked.
3. **Step 10 remainder** — the illustrated milestone path click-through, and the community goal once Nina sets a target.
4. **Headshot upload.** Nothing writes `member_profiles.headshot_path`; the bucket, policies and column all exist. Directory listings show initials on brand navy instead, so it reads as finished rather than broken.
5. **Steps 12–13** — roadmap reveal generator (AI, paused) and final polish.

## The two-week check-in — confirmed 3 Sep, build it as written
The definition **stands as written, no longer pending**: fires two weeks after a specific build, in portal chat; the member posts what worked and what didn't, tagged to that build; Nina reviews and decides whether to retire the rate. Non-response defaults to keep accruing — retiring needs evidence, not silence.

Everything it needs exists: `build_check_in` is already in the `due_job_kind` enum unhandled (the same position `hours_ledger_week` sat in), chat carries `handover_pack_id` on every message, and the testimonial consent toggle is built and off by default. **Without it nothing ever triggers retiring a rate**, so a build that stopped running keeps accruing hours forever and the headline number drifts upward untrue.

## Known coverage gap: the job runner's send path
`runMatching` is now tested end to end, including which notification jobs are queued and for whom. What still has **no test**: the handlers that read those jobs and send — `runPairingBooked`, `runPairingDay7`, `runChatNotification`, `runHoursLedger`, both reminder tracks. Nothing exercises what gets skipped at send time or what the email says.

`runPairingDay7` was manually verified live on 3 Sep, both directions. That's real evidence and it's a one-off — nothing re-checks it on the next change.

Closing it needs the handlers exported (only `runDueJobs` is) and a stub for `@/lib/email/send`. The fixture work that was blocking it is done: it now resolves one-to-many embeds by asking `information_schema` which way the foreign key runs, and serialises dates as strings the way PostgREST does.

## Scoped but deliberately not built: true push notifications
Deferred to its own session by decision, not oversight. Needs a service worker, VAPID keys (3 new Vercel env vars), a per-device `push_subscriptions` table, permission UX, and iOS guidance. Three things worth keeping:
- **The "short buffer for rapid messages" doesn't need a scheduler.** A per-(member, channel) cooldown gives the same result with no cron change, and Next 16's `after()` sends without adding latency to hitting Send. A buffer would otherwise reintroduce the sub-daily cron that was deliberately declined.
- **Notification text should not quote the message**, matching the unread-email decision: a banner on a lock screen is the same exposure.
- **The testing story is much weaker than everything else here.** Permission is one-shot per device — deny once and you cannot ask again. Needs a physical iPhone.

## Decisions, not gaps — do not "fix" these
- **AI drafting is paused** pending Nina. `ANTHROPIC_API_KEY` deliberately unset; the hot seat prep panel stays empty with manual confirmation. That is the tested working state, not an unfinished feature.
- **Notification cadence stays daily.** The cron runs 08:00; a notification queued at 14:00 lands next morning. The one-hour gate still decides *whether* something is worth notifying about, so nothing queues mid-conversation. `due_jobs.due_at` exists and the runner honours it, so a finer cadence is a `vercel.json` change if ever wanted.
- **The community goal has no target** — §2 asks for the collective number but never says what it counts towards. Inventing one is worse than waiting.
- **Chat messages cannot be edited or deleted**, matching the voice bucket's existing rule. Stricter than most chat products; easy to relax, hard to recover an edited conversation.

## Waiting on Nina
- The actual multiple-choice audit questions and answers.
- The welcome session recording, and the three priming content pieces.
- A community-goal target.
- Confirming Resend deliverability isn't landing in spam long-term.
- Confirming the spreadsheet-download exception as a standing rule (leaning yes).

## Real bugs found and fixed (running list, worth knowing the shape of each)
1. Vercel Authentication toggle blocking public site access
2. `supabase link` CLI bug — worked around via direct connection string
3. Eight queries missing explicit member scoping (relied on RLS alone) — now a standing `CLAUDE.md` rule
4. Roadmap published to wrong account (same root cause as #3)
5. Hot seat session query assumed "week one" rather than reading the real `scheduled_for`
6. Timezone split between how session times were stored vs displayed
7. Reminders not auto-invalidating when a session is rescheduled
8. Vercel deploys not triggering automatically from git push (twice)
9. Work reported "done" while sitting uncommitted — **building and shipping are two separate things; say which has happened**
10. Session pooler rejecting three freshly-reset passwords with `28P01` — the pooler username must be `postgres.<ref>`, not `postgres`. Never actually fixed, only worked around
11. `npm run db:bundle` emits **every** migration — a bootstrap tool, not a way to apply one pending migration
12. A flaky test hiding behind `&&`, failing 6 runs in 12 on untouched code while being quoted as passing
13. A test that passed for the wrong reason — found by mutation, not by reading
14. **The admin is also an active member.** `draw_eligibility()` and the hot seat prep sheet filtered on `status` alone, putting Nina on her own prep sheet and in the hat for a prize she gives away. `role = 'member'` is the distinction
15. **`members` is readable only by its owner**, so joining it for a name returns null — chat labelled everyone "A member". Fixed with a narrow security-definer function returning names only, not a broader policy that would leak email and contract terms
16. **A member could have cleared the day-7 flag Nina relies on.** RLS is row-level, so a policy letting them update their own pairing let them update every column. Fixed with a trigger. **A comment claiming a restriction a policy can't express is a bug report**
17. **The coach was whoever pressed the button** — fine with one admin, wrong with two. Now an explicit `members.is_coach`, unique and constrained to admins
18. **Matching would have created every pairing and told nobody.** The notification jobs were queued with the admin's own session, and `due_jobs` has no policy for anyone signed in. RLS refused; the pairings looked perfect; not one person would have been emailed. Caught by a defensive error check added hours earlier, surfaced by the first real test of the function. **The check that made an invisible failure visible was worth more than the fix**
19. **This document's own updates silently failing** — string replacement against anchors that no longer existed, reported as success. Same silent-no-op shape as #18 and as a mutation test that never applied

## Environment variables confirmed set in Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`. **`ANTHROPIC_API_KEY` deliberately unset** — see decisions above.

## Migrations
**Nine pasted directly via the SQL Editor across 1–3 Sep, not through the CLI** — the pooler connection was never fixed, only worked around. Root cause still unknown; the username finding is written up in the README. `migration repair` owed for all nine once the pooler works — safe to keep deferring, each is idempotent or purely additive.

## Standing rules, learned the hard way
- **Always confirm real testing is complete — actually done, not just described as done — before committing or pushing.**
- **Prove a test can fail before trusting it.** Reintroduce the bug, watch that test go red, restore. Twice this week a green test was proving nothing.
- **Assert that a mutation, or a file edit, actually applied.** A silent no-op looks identical to a passing check.
- **Sample before calling a suite green.** One run is not evidence.
- For a build this size, start a fresh session per major step or per day rather than one marathon.

## Right now, exactly
Steps 1–8, 10 (core) and 11 are done. Next: **the two-week check-in**, which closes Step 10's loop, then Step 9's handover pack.

**To pick this up fresh: `CLAUDE.md` + this file, nothing else needed.**
