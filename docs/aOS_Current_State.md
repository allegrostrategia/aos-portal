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
1. **Step 10 remainder** — the illustrated milestone path click-through, and the community goal once Nina sets a target. Next. — see the coverage gap below. Agreed timing: after the Roadmaps section, or sooner if real onboarding is imminent. Not a dedicated session; the fixture work that was blocking it is done.
2. **Headshot upload.** Nothing writes `member_profiles.headshot_path`; the bucket, policies and column all exist. Directory listings show initials on brand navy instead, so it reads as finished rather than broken.
5. **Steps 12–13** — roadmap reveal generator (AI, paused) and final polish.

## The two-week check-in — BUILT 3 Sep, closes Step 10's loop
Fires two weeks after a build's rate starts earning, emails the member in their conversation with the coach, and they reply tagged to that build with the consent toggle off by default. **One per build, ever** — the dedupe key has no date in it, because §2 says non-response means the rate keeps accruing, and a second email would be chasing somebody for permission to take hours away.

Nina sees the responses **on the member page, directly above the retire button** — that's the "evidence, not silence" half made real. Where nothing has been said, it says so rather than leaving a blank.

Anchored to `effective_from` rather than row creation, and planned from `<= today - 14` so a fortnight the cron missed is caught rather than skipped forever. Skips a cancelled member, an already-retired rate, or a project with no coach to reply to.

`ensure_direct_channel()` was split out of `open_direct_channel()` so the runner can open the conversation without a session — the original reads `auth.uid()`, and a job has none. Not reachable by anyone signed in.

## Step 9 — Archivio and the SOP template, BUILT 3 Sep
`/stations/archivio` — a real station on the map, and the one that holds nothing from the library (`holds_training_content` was already false for it). Two sources in one list: what Nina wrote up from a hot seat build, and what the member documented themselves.

**The SOP tool is a template, not a generator** (see the AI decision). The questions are the product — trigger, outcome, owner, tools, ordered steps, optional walkthrough video. A member who has answered those has written the SOP; the generator would have rephrased them. Half-finished saves are allowed and the page says what's still missing, because somebody writes the steps, gets interrupted, and comes back.

**Export is browser print-to-PDF**, at `/stations/archivio/[id]/print` — a clean document page outside the portal chrome. Deliberate over a PDF library: no dependency, no server rendering, no font embedding, works on a phone through the share sheet, and the output is a real PDF. The trade is pagination control, worth giving up for a page of numbered steps. A branded, precisely laid out document is when a renderer earns its dependency. §11 holds: SOPs are still the only exportable thing.

Members can delete their own SOPs — the one place rule 6 doesn't apply, since a draft somebody thought better of isn't the record of their membership.

**Step 9 is complete (3 Sep).** Nina writes a build up from the member's admin page; saving publishes it straight to their Archivio, with no draft state — she works the wording out with Claude externally, so drafting happens where drafting happens, and a half-written note sitting in a column the member can technically read is a worse answer than not storing one. The member can then reword their own copy (§8), which reads as prose until they choose to change it rather than as a text box waiting to be filled in.

## The send path — CLOSED 3 Sep
16 tests over the handlers that read a due job and send: the check-in, both pairing emails, the unread notification, and the hours ledger. They assert who it went to, whether it went at all, and the words — not just that the function returned.

What that pins down, none of which any schema test could reach: the check-in skips a cancelled member and a retired build and names the rate in the email; the booked-in email names the *partner* rather than the recipient, quotes the shared slot, and offers no meeting URL; the day-7 flag goes to the coach and is set as it sends; the unread email never quotes the message; reading a conversation first cancels its email; a week that didn't qualify is skipped rather than failed; and a delivery failure is raised rather than swallowed as a success.

The handlers are exported for this, which is a slightly wider surface than the code needs — `runDueJobs` is the only real caller. Testing through it would need PostgREST's `or(...)` syntax reimplemented in the fixture, and these are where "nothing was sent" and "the wrong person was emailed" both live. Worth the export.

**Still not covered:** the two reminder tracks (`runReminder`, `runHotSeatReminder`), whose decision logic is already unit-tested as pure functions and whose delivery was verified by hand on 31 Aug. And `runDueJobs` itself — planning, dispatch and the pending-jobs query.

## Scoped but deliberately not built: true push notifications
Deferred to its own session by decision, not oversight. Needs a service worker, VAPID keys (3 new Vercel env vars), a per-device `push_subscriptions` table, permission UX, and iOS guidance. Three things worth keeping:
- **The "short buffer for rapid messages" doesn't need a scheduler.** A per-(member, channel) cooldown gives the same result with no cron change, and Next 16's `after()` sends without adding latency to hitting Send. A buffer would otherwise reintroduce the sub-daily cron that was deliberately declined.
- **Notification text should not quote the message**, matching the unread-email decision: a banner on a lock screen is the same exposure.
- **The testing story is much weaker than everything else here.** Permission is one-shot per device — deny once and you cannot ask again. Needs a physical iPhone.

## FINAL: no AI runs inside the app, anywhere (3 Sep)
**Settled, not pending. `ANTHROPIC_API_KEY` never needs to be added at all.** All four original AI touchpoints are resolved without it:

1. **Hot seat prep** — unchanged. Nina reads the raw evidence (their words, their tracked hours, the biggest time block) and confirms manually. Already built this way.
2. **Initial roadmap** — Nina works it out with Claude *externally*, then types the result into a new admin **Roadmaps** section. See new scope below.
3. **SOP generator (Step 9)** — becomes **member-facing**: a reusable template a member fills in themselves whenever they've built something worth documenting, compiling to a clean PDF. No AI, no API key.
4. **Roadmap reveal document** — unchanged. Nina drafts with Claude externally and sends the result.

The pattern across all four is the same: **Claude is a tool Nina uses outside the product, not a dependency inside it.** `CLAUDE.md`'s standing rule 2 ("AI drafts, human confirms") still describes how Nina works — it no longer implies anything runs in-app. A fresh session should not wire an API call anywhere.

## The admin Roadmaps section — BUILT 3 Sep
`/admin/roadmaps`, its own nav entry, filtered by member through the URL so a roadmap can be linked to and come back to. Months hold focuses, focuses hold actions, and each action carries the training it points at and the week it's meant for (a plain dropdown, no drag-and-drop). Nothing drafts anything — Nina works the plan out with Claude externally and types it in.

**The load-bearing rule: an action keeps its id when its wording is unchanged.** `weekly_submissions.actions_taken` and `roadmap_action_notes` both key off those ids, so renaming a focus, reordering actions or moving one to a different week must not detach a member's ticks or separate them from what they wrote. A *reworded* action gets a new id, which is the honest answer — what they ticked isn't what's there now. Covered by 9 action tests, because when this breaks nothing errors: the roadmap saves, looks right, and a member's history quietly stops belonging to anything.

**The old shape is read, not migrated.** `readRoadmap()` normalises a legacy phase into a month with one focus, and keeps the `<phase>:<item>` fallback id the weekly log has written since Step 5. No script has to be right about real members' plans.

`roadmap_action_notes` is the per-action comment box — one note per action, edited in place rather than appended to, so a member saying "actually it's working now" updates what they said rather than leaving Nina two contradictory notes. Nina reads them beside the action in the editor.

## Decisions, not gaps — do not "fix" these
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
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`. **`ANTHROPIC_API_KEY` is never needed** — settled 3 Sep, see the AI decision above.

## Migrations
**Thirteen written 1–3 Sep. All thirteen are applied to live** — pasted directly via the SQL Editor, not the CLI, because the pooler connection was never fixed, only worked around. Nothing is pending as of 3 Sep.

Root cause of the pooler failure is still unknown; the username finding (`postgres.<ref>`, not `postgres`) is written up in the README. `migration repair` is owed for all thirteen once the pooler works — safe to keep deferring, each is idempotent or purely additive.

**Before saying a migration is pending, check.** `ls supabase/migrations/` against what has been pasted, or `git show --stat` on the commit that supposedly added one. A stale "still to do" is worse than a missing one, because somebody acts on it.

## Standing rules, learned the hard way
- **Always confirm real testing is complete — actually done, not just described as done — before committing or pushing.**
- **Prove a test can fail before trusting it.** Reintroduce the bug, watch that test go red, restore. Twice this week a green test was proving nothing.
- **Assert that a mutation, or a file edit, actually applied.** A silent no-op looks identical to a passing check.
- **Sample before calling a suite green.** One run is not evidence.
- **Check every table for the column-ownership trap.** RLS is row-level: a policy letting somebody update "their own row" lets them update *every column* of it. Three tables have had this — `members`, `pairings`, `handover_pack` — and each time the giveaway was a comment above the policy describing a restriction the policy cannot express. **Treat that comment as a bug report, and add a trigger.** Worth checking on every new table with a member-facing update policy, not just when something looks wrong.
- For a build this size, start a fresh session per major step or per day rather than one marathon.

## Right now, exactly
**Steps 1–11 are done**, including the two-week check-in and Step 9's Archivio.

Next: **the admin Roadmaps section** and the richer roadmap structure it needs (months → focuses → actions, each action linked to a training, with its own comment box and a week-number dropdown). Then **the send-handler tests**. Then Step 10's remainder and Steps 12–13.

**Before anything else: three migrations are waiting to be pasted** — see Migrations above. Archivio and the check-in are built but won't work on live until they are.

**To pick this up fresh: `CLAUDE.md` + this file, nothing else needed.**
