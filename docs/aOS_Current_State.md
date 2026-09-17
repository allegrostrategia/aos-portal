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

## DEFERRED, NOT DROPPED: milestone rewards
**Real unlockable rewards at each milestone threshold (50 / 100 / 250 / 500 / 750) are intended.** They are not scoped, not designed and not built — and that is a deferral, not a decision against them.

Until they exist, the copy says **"distance to your next milestone"** rather than §2's "distance to next unlock". Changed 3 Sep: the brief uses "unlock" throughout and never says what is unlocked anywhere, so the original wording promised members something the product didn't have. The mechanic underneath is unchanged.

**When rewards are scoped, `/milestones` is where they go.** The thresholds, the crossing dates and the progress bands are already built; a reward hangs off an existing step rather than needing the page rebuilt. The copy reverts to "unlock" at the same time, and not before.

This is its own section rather than a line in the open list because it is a product promise waiting to be defined, not a small piece of work waiting for a slot.

## ROUND 3 — Weekly Check-Ins channel, hot seat prep flow — BUILT 15 Sep, PUSHED 17 Sep after Dom's walkthrough

Commits `fa28cd3` (A), `3f5f46d` (B), plus state doc, the settled Friday decision and a getChannel error log (`aaa7875`). Migrations applied 15 Sep (after a Supabase maintenance window). **Walked through by Dom 17 Sep: reflection form, note, push, Piazza flag, reply, confirmed build, archive swap all confirmed working.** Brief: `docs/aOS_Round3_CheckIns_And_HotSeat_Brief.md`. Verified: tsc, lint, build clean; **187 unit / 272 schema / 109 action**, every new test mutation-checked.

### Built
- **A. Weekly Check-Ins.** Fourth group room, shared. Open Mondays 14:00 to 15:30 UK time (the clock change is handled: the window is a wall-clock time). Readable always; outside the window members see a locked state with the next opening, and the insert policy refuses a post that skips the screen. The window is three columns on `chat_channels`, so changing the hours is a row update, and a second timed room needs no code.
- **B. Hot seat prep flow.** Reflection section (plus "Not sure yet" flag) beside the three unchanged questions, with the member's month-so-far above the form. Comment thread on the submission: Nina's note, member reply, two-way, no edits or deletes. Nina's note pushes the member and becomes the first task on Piazza until they open the thread. Confirmed build in its own navy box at the top; the thread folds behind "View archived comments" once confirmed. Prep sheet shows reflection, thread, note form.

### SETTLED (Nina, 15 Sep): the Friday reflection stays private. Nothing feeds the channel.
The weekly log's "Anything else this week" is a private reflection, read by Nina on `/admin/touchpoint` and answered by her in the Monday room. **It is never posted into the shared Weekly Check-Ins room, automatically or otherwise.** Option 1 of the three that were on the table; the auto-post (option 2) is not "later", it is no. Confirmed by Nina directly, not a preference. Do not revisit without asking first.

### Judgement calls, flagged
- **Admins are exempt from the window.** Nina can open the room with a word before two, or answer the last one at twenty to four. One line in the policy and one in the action if it should lock everyone.
- **"Editable by Nina" was read as "annotate", not "rewrite the member's answers."** The thread is the two-way mechanism; the three answers stay the member's words. Admin RLS would allow editing them directly, but no screen does.
- **Nina's note pushes with no preference gate** (unlike chat, which respects `push_chat`). Once or twice a month, about their own session, asking them to do something. A member's reply does not push Nina (rule 5); it's on the prep sheet.
- **The member's side of the thread closes when the build is confirmed.** "Archived" in the brief was read as closed. Nina can still comment. A member with more to say has the call.
- **Per-member call minutes removed from member-facing copy**: page intro, form hint, and two reminder emails said "five minutes". The brief says that number is planning context and must not appear. The reminder *schedule* is untouched; only the sentences changed. Worth a glance at `src/lib/jobs/copy.ts` lines 69–70 and 92.
- **Thread labels use `coach_member_ids()`**: Nina's admin row has `is_coach` set live (checked), so notes read "Nina". Dom's admin account would read as its first name.

### Go-live steps — all done
1. ~~Walk through it~~ — Dom, 17 Sep, every step.
2. ~~`npm run db:push`, two migrations~~ — applied 15 Sep.
3. ~~Decide the Friday question~~ — settled, above.
Not yet seen in the open state: the Weekly Check-Ins room on a Monday afternoon. First real one is 21 September, 14:00.

## ROUND 2 — fixes, corrections, ledger change, chat, push — built and PUSHED 14 Sep

**Eight commits on `main`, pushed 14 Sep** (`df57812`..`b14c0a0`), then `d1c6962` (push recipients, see bug 25) and the live-chat fix (bug 26). Brief: `docs/aOS_Round2_Fixes_And_Chat_Push_Brief.md`. Verified at the end: tsc, lint, build clean; **175 unit / 249 schema / 97 action**.

### Regression or not — the honest answer per item in A
| # | Item | Verdict |
|---|---|---|
| A1/A6 | La Strada unusable on a phone | **Not a code regression.** The map's geometry was byte-identical to the phone-confirmed commit: 197px tall, 36px tiles, names on hover. Reworked anyway: one fixed view (C3), twice the screen on a phone, opens on the Piazza, ~62px tiles, names always on |
| A2 | Sociale wider than the screen | **Regression** from the redesign's grid (`min-width:auto` on grid children). Fixed |
| A3 | Photo behind the stats | Introduced by the redesign, never approved. Now a plain orange block |
| A4 | Off-palette dark | Introduced by the redesign. Now navy; the charcoal token is deleted |
| A5 | Wrong image on La Strada | **Could not place.** The map and thumbnails are the right files. Likely A3 seen from another angle. **Re-check after A3.** |
| A7 | No calendar | My one-day-at-a-time reading, drawn only when the day had entries. Now a seven-column week calendar, always drawn |
| A8 | PWA icon is text | **Not fixable from the repo.** All four files in `public/brand/` (2 Sep) are the serif "aOS" text mark, the SVG included. **The orange/blush-on-navy icon needs dropping in.** |
| A9 | Pairing dates | Dates now under each weekday. **A bug underneath:** nothing ever writes `pairings.scheduled_for` and a member can't read their partner's availability, so "you're both free X" had never once shown. Fixed with a narrow security-definer function. **The grid's meaning is still weekday-based; per-date ticking would be a model change, unconfirmed.** |
| A10 | Icebreakers missing | Built at screen 5 but only inside the pairing card. Always shown now |

### Built (B–F)
- **B**: 200 em dashes out of the copy (478 in comments stay); tagline "Time reclaimed, not time off."; "fifteen boxes" gone; La Strada's line added.
- **C**: colour always (visited UI gone, visits still recorded); safe-area padding as an inline style plus cream on `html` plus manifest background, **cause unconfirmed, check on the phone**; Sociale opens on General with a chip strip; directory as name + link + two boxes (`business_about` column, search vector rebuilt); Roadmap link on Piazza; hot seat card in four honest states from the member's own submission.
- **D**: `accrue_hours_for_week()` no longer reads hours or submissions. **Not backfilled** — weeks the old rule skipped stay skipped unless Dom asks; the function is idempotent. **Flag:** the draw's gate is ten hours only and never checked submission; the brief's "tracked-and-submitted" overstates it. Unchanged.
- **E**: pins (`chat_pins`, admin-only, cascade), images (`image_path`, private `chat-images` bucket, own-folder check constraint, `/api/chat-image`), search (tsvector + GIN, `/sociale/search`), retraction (**reverses the standing no-delete rule; admin delete did not exist before either** — both new), Coach badge. Composer now clears its voice/picture after a successful send (latent bug).
- **F**: `push_subscriptions`, two push switches, web-push sender triggered from the actions in `after()`, `/sw.js` (push only, no caching), device toggle on You. **No database webhook and no webhook secret** — deliberate, flagged.

### Go-live steps — done 14 Sep, except the phone pass
1. ~~Walk through it~~ — done by Dom.
2. ~~`npm run db:push`, five migrations~~ — done; `migration list --linked` matches, `20260914120000` (the ledger change) included.
3. ~~`chat-images` bucket~~ — done, private.
4. ~~VAPID variables in Vercel and `.env.local`~~ — done; the redeploy that inlines the public key is the push of this commit.
5. ~~The real icon~~ — done (`b14c0a0`), favicon rebuilt from it, old blue SVG removed. **iOS caches the home-screen icon: remove and re-add the app to see it.**
6. ~~Push on a real phone~~ — **confirmed working 14 Sep** on Dominic's iPhone, after bug 25 (group rooms have no participant rows, so the sender found nobody). The subscribe half had worked first time.
7. ~~`npm run db:push` for `20260914150000_reactions_realtime.sql`~~ — applied 14 Sep; pushed as `ea896f8`. **Confirmed by Dom in a two-window test: messages and reactions both arrive live.**
8. **Phone pass — still to do:** the nav's bottom strip (C2), the map (A1), Sociale width (A2).

## L'EDITORIALE REDESIGN — built overnight 13–14 Sep, PUSHED 14 Sep after Dom's walkthrough

**Thirteen commits on `main`, pushed 14 Sep** (`795bd52..9976960`). Deployed by Vercel; all eight migrations applied via `npm run db:push`; the `archivio` bucket done in the dashboard. **The `message_reactions` publication step was recorded as done and was not** (bug 26); it is a migration now. Nothing outstanding from this range. Brief: `docs/aOS_LEditoriale_Redesign_Brief.md`; reference: `docs/LEditoriale_full_reference_poster.png`.

### Built
| # | Screen | Status | New scope shipped with it |
|---|---|---|---|
| — | Tokens & primitives | done | cream/ink/charcoal tokens, upright serif, pills, `NumberedRow`, `Pill`, `Quote`, `Avatar`; 55 headings made upright, 503 navy→ink class changes; CLAUDE.md brand rules rewritten |
| 1 | Nav + La Strada | done | five-item nav with icons; map/list toggle via `?view=list`; admin routes to sidebar + You |
| 2 | Station + lesson | done | `lesson_completions` table; Lessons / Tools / Replays sections; Mark as complete |
| 3 | Your log | done | day strip, Log/Timer/Insights tabs, day timeline, two SVG charts, `getWeekEntries` |
| 4 | Sociale | done | `message_reactions` table (four fixed emoji); bubbles, headshots, room list, desktop split |
| 5 | Pairing | done | `pairings.booked_at`; photos side by side; three icebreakers |
| 6 | Archivio | done — **HIGH RISK** | folders + search; `template` source + `image_path` + `archivio` bucket policies; **the hot-seat SOP flow turned round** (`coach_note`; Nina's write-up form and the member's rephrase editor removed) |
| 7 | Onboarding | done — **HIGH RISK** | six steps, `onboarding_steps` table, nothing reads `members.status`; compact on Piazza, full on /onboarding |
| 8 | Piazza | done | onboarding path → hero + quote + glass metrics strip → task list → hot seat / milestones / pairing cards |
| 9 | Milestones | untouched | only the global token propagation reached it |
| 10 | You | done | `/you` page; three notification switches on `members`, honoured in `runner.ts` at every member-facing sender |

Verification at the end: tsc, lint, build clean; **171 unit / 232 schema / 90 action** (from 171 / 203 / 88). Every new policy mutation-tested; every clause a test can reach is killed, and the ones that can't (delete owner-checks, which a SELECT policy already shields) are documented in the migration.

### Go-live steps — all done 14 Sep
1. ~~Walk through it locally~~ — done by Dom; four decisions came out of it (below).
2. ~~Dashboard: `archivio` bucket~~ — done. ~~`message_reactions` in the Realtime publication~~ — **was never actually in it**; now migration `20260914150000`, see bug 26.
3. ~~`npm run db:push`, eight migrations~~ — done, before the push.
4. **Phone test the blur — still worth doing on the live site.** Two uses only: the bottom nav and the Piazza stat strip. The nav is the one that re-blurs on every scroll frame. If it's janky, set `--aos-glass-blur: none` in `globals.css` and everything falls back to its solid fill.
5. ~~Push~~ — done.

### Judgement calls that need Dom's eyes (most important first)
- ~~Orange primary buttons, white text~~ — **decided 14 Sep: ink text on orange (3.5:1)**, on accessibility not preference. Done.
- **The SOP flow (screen 6).** Nina's write-up form is gone; she leaves a comment; the member writes the SOP on the build's own row. Everything she already published still reads, above the member's form. The `sop`-only-on-`member_sop` constraint was dropped and its test retired with the reason in place.
- **Onboarding (screen 7).** The directory listing dropped out of the sequence (it isn't in the brief's six). "Book your 1:1" is the one step with no fact behind it, so it's a tick. Two steps say "carry on regardless" where content is still on Nina's list.
- ~~Calendar blocks coloured by bucket~~ — **approved 14 Sep as built.** Ten hues that stay apart in every pairing under colour-vision deficiency on cream don't exist; the dataviz method caps an any-pair identity palette at ~3. Colour says Systems / Profit / Visibility; the label on every block says which category. Validated on the card surface, all pairs.
- ~~Lesson tabs / takeaways~~ — **deferred 14 Sep: a content gap, not a code one.** Lessons get per-lesson notes/resources/takeaways when Nina has them to give.
- ~~Piazza quotes~~ — **on Nina's content list as of 14 Sep.** Placeholders stay until she supplies hers; `src/lib/piazza/quotes.ts`, one array.
- **`text-ink` (#0A1E4A) for all text**, with brand navy kept for the map lines and nav state. One variable if it reads wrong.
- **Hot seat page (`/hot-seat`) was not restyled** beyond propagation — it isn't a numbered screen in the brief. The reference's dark treatment is on the Piazza card.

### Not built, and why
- Roadmap's full screen — parked by the brief. Its entry points exist: the Piazza focus line, the log's sign-off checklist.
- Swipe Copy, Workbooks, Brand Assets — dropped by the brief.
- Presence / "online" — dropped by the brief.
- Client Reporting — a separate build.
- Week navigation on the log (previous weeks) — the reference's arrows; not in the brief's text, and the sign-off is per current week. Small, worth asking.

## Genuinely still open
1. ~~**The design/artwork pass**~~ — **done.** La Strada redrawn 4 Sep, the milestone path illustrated 8 Sep. Both illustrated screens now exist.
2. **The community goal** — needs a target from Nina before it can be built at all.
3. **Step 13** — final polish: the Vespa intro video on first login, and the optional animation flourishes (flip-board counters, the FATTO stamp, self-drawing blueprints), all independently droppable.

## Step 12 — the reveal document, BUILT 3 Sep
`/admin/reveal`, with the document itself at `/admin/reveal/[memberId]/document`.

**An admin tool, not member-facing — and that's from §1, not a shortcut.** The reveal is handed over at the end of the 1:1 "before they even log into the portal", which is why it's a document rather than a screen; once they're in, La Strada is the living version of the same thing. The table has **no member policy at all**, rather than a restrictive one — a policy would imply there's a case where they should read it.

§1 described it as Claude-drafted and Nina-confirmed. It isn't: she writes it with Claude outside the product. What the app contributes is the document — one structure and one type system for every member, instead of whatever survives being hand-edited each time. The form asks in the document's own order (what they said, what's working, what isn't, then priorities), because asking for priorities first produces a task list rather than a reading of somebody.

**A snapshot, deliberately.** Priorities are stored on the reveal rather than read live from `roadmap`, so re-pointing somebody in November doesn't rewrite what was said at their 1:1 in March. A test asserts exactly that.

Export is browser print-to-PDF, same as the SOP. One reveal per member — a second would be the same moment rewritten.

## Headshot upload — BUILT 3 Sep, closes the directory gap
On the onboarding directory form. Browser straight to storage, like library uploads and voice notes — a Server Action body is capped at a few megabytes on Vercel and a phone photo routinely isn't.

**No signed URL, unlike the library.** The `headshots` bucket has a member insert policy scoped to their own folder, so their own session is allowed to write; the library needed signing precisely because its bucket has no member policy at all. Same shape, different mechanism, and using the member's own session where the policy permits it is what CLAUDE.md asks for.

**Resized in the browser before upload**, longest edge 800px. A phone photo is several megapixels and a directory card renders it at 56. `imageOrientation: "from-image"` is what stops a portrait phone photo arriving sideways — the rotation lives in EXIF that a canvas otherwise discards. If any of it fails the original uploads unchanged: a sideways photo beats a member who can't add one.

HEIC is accepted because it's what iPhones produce by default. Greying it out in the picker means the member whose only photo is a HEIC skips the step.

Replacing removes the old object, so the bucket doesn't fill with orphans.

**The path is checked server-side against the member's own folder.** The storage policy stops anyone writing outside their prefix and stops nothing about a listing *claiming* somebody else's photo — the same small forgery the voice-message path guards against. A mutation proved that guard had no test; it has five now.

## La Strada — redrawn to the reference, 4 Sep
The artwork is now **16:9** (1536×864, centre-cropped from the 3:2 original; the original is in git history). Every position was recalculated against it.

**The reference is not a crop of our artwork.** Its fountain sits at 41% across where ours is at 51%, and no crop moves content outward — it's a separately-generated render of the same scene. Its *look* transfers; its *coordinates* don't, so stations are placed against our actual picture. Worth knowing before anyone tries to match reference percentages again.

What changed:
- **Hub and spoke.** Every coloured line now radiates from the fountain, because that is what Piazza is. The old version chained station-to-station, which drew a route between shops rather than places reached from home.
- **Your Story has a line again** — pale, along the bottom, through two bends that carry the white dots the legend calls "Your Story Stations". The previous no-line default was **a regression, not a fresh choice**, and is overruled.
- **Markers** are photo tiles with a numbered badge (from `stations.sort_order`, so the numbering has one source) and the name above rather than below.
- **Legend** is a translucent panel on the picture, bottom right, with the Your Story Stations row. The inline key below the image survives for phones, where the panel would cover a third of the map.
- **Piazza — Home** and **Piazza Sociale** are labelled on the map and link through, though neither is a station.

Two calls the reference couldn't settle: markers are rounded rectangles rather than circles, because the station photographs are architectural and a circle crops the building out; and the line casing is a dark shadow rather than the previous pale halo, because a light casing disappears against the bright square where most of the lines run.

**Not yet seen rendered.** Positions, spacing and overlap are guarded by tests, but whether it *looks* right is unverified — see the standing rule about walkthroughs.

## The milestone path — BUILT 3 Sep, illustrated 8 Sep
`/milestones`, linked from Piazza's compact line — §2's "compact + click-through", the same pattern as the draw card.

**The mechanic worth having is when each threshold was crossed**, not a bigger progress bar. "You passed fifty in the week of 9 March" is a different thing to say than "you're 62% of the way to a hundred", and the append-only ledger is what makes it answerable — a rate retired in June doesn't move when March happened, and a test asserts exactly that. Each band is measured from the previous threshold rather than from zero, so the long stretch to 500 doesn't look static for months.

A qualifying week worth zero hours still appears in the week-by-week list: it's a week they showed up, and dropping it would make the record sparser than the truth.

**Illustrated 8 Sep.** A coast road runs down the picture with the five thresholds on it; the stretch already travelled is picked out in orange and the road ahead is dashed white. Zero hours is at the top, so a member sees where they are on load and scrolls toward what is ahead — Dom's call, and the reason the page scrolls normally rather than living in a La Strada-style pan container.

**A fifth threshold, 750, was added with it** (8 Sep). The artwork carries five markers and a fifth marker with nothing behind it in the data would have been decoration pretending to be a milestone.

**The road is traced from the artwork, not hand-placed** — `scripts/build-milestone-path.mjs`, checked by `milestone-path.test.ts`. Two things made that harder than it looks and are worth knowing before touching it: the same colour rule that finds asphalt also finds rooftops, walls, rocks and boat wakes (connectivity throws them out, as on La Strada); and 52% of horizontal lines cross this road twice because it switches back, so distance has to be measured along the ribbon rather than read off the height. Tree canopy breaks the road into three pieces, bridged by nearest-pair rather than hardcoded coordinates.

**Spacing is even, not proportional to hours** — each threshold gets a fifth of the road. Proportional spacing puts 50 hrs 6.7% along and gives 500→750 a third of the picture, so nothing appears to move for months. Same reasoning as the per-band progress bar.

**The copy says "milestone", not "unlock"** — see the deferred-decisions section above. Rewards are intended and unscoped; the wording reverts when they exist.

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
- What a milestone unlocks — deferred rather than pending; see the deferred-decisions section.
- Confirming Resend deliverability isn't landing in spam long-term.
- Confirming the spreadsheet-download exception as a standing rule (leaning yes).
- **Quote-of-the-day lines for Piazza** (added 14 Sep) — seven or more, in her voice. Placeholders in `src/lib/piazza/quotes.ts` until then; one array.
- **The two-week time-tracking explainer video** (from the redesign brief).
- **Per-lesson notes, resources and key takeaways** — deferred 14 Sep as a content gap; the lesson page's tabs and checklist get built when there is something to put in them.

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
10. Session pooler rejecting three freshly-reset passwords with `28P01` — the pooler username must be `postgres.<ref>`, not `postgres`, and the same error a wrong password gives. **Fixed 10 Sep**, nine days later: a month-stale CLI was the top layer, and beneath it two faults that were never wrong simultaneously, so each fix read as a failure. See the Migrations section
11. `npm run db:bundle` emits **every** migration — a bootstrap tool, not a way to apply one pending migration
12. A flaky test hiding behind `&&`, failing 6 runs in 12 on untouched code while being quoted as passing
13. A test that passed for the wrong reason — found by mutation, not by reading
14. **The admin is also an active member.** `draw_eligibility()` and the hot seat prep sheet filtered on `status` alone, putting Nina on her own prep sheet and in the hat for a prize she gives away. `role = 'member'` is the distinction
15. **`members` is readable only by its owner**, so joining it for a name returns null — chat labelled everyone "A member". Fixed with a narrow security-definer function returning names only, not a broader policy that would leak email and contract terms
16. **A member could have cleared the day-7 flag Nina relies on.** RLS is row-level, so a policy letting them update their own pairing let them update every column. Fixed with a trigger. **A comment claiming a restriction a policy can't express is a bug report**
17. **The coach was whoever pressed the button** — fine with one admin, wrong with two. Now an explicit `members.is_coach`, unique and constrained to admins
18. **Matching would have created every pairing and told nobody.** The notification jobs were queued with the admin's own session, and `due_jobs` has no policy for anyone signed in. RLS refused; the pairings looked perfect; not one person would have been emailed. Caught by a defensive error check added hours earlier, surfaced by the first real test of the function. **The check that made an invisible failure visible was worth more than the fix**
19. **Ticking an action on the weekly log didn't survive a refresh.** Two bugs behind one symptom, found by hand: nothing was saved until sign-off, and the form never rendered what *had* been saved (`defaultOtherActivity` was passed and used; `actions_taken` was simply missed). The schema had anticipated this all along — `submitted_at` is nullable and the update policy permits edits only while it is null, so a draft row was always the intended shape and the UI never wrote one. **Found by opening the screen, not by any test.**
20. **Both print views printed the whole navigation.** The SOP export and the reveal document render *inside* the portal layout — they need its session — and nothing hid the chrome at print time. Their own comments claimed they sat "outside the portal chrome", which I'd asserted without checking; the comment was wrong before the code was. **A comment describing where a thing sits is worth verifying like any other claim.** Fixed with `print:hidden` in the layout, which covers every print view rather than each one arranging its own escape.
21. **This document's own updates silently failing** — string replacement against anchors that no longer existed, reported as success. Same silent-no-op shape as #18 and as a mutation test that never applied
22. **A station marker placed in the sea** — Grand Hotel Riposo sat at (12, 80) on the La Strada artwork, which is open water among the moored boats: a marker-sized patch sampled there comes back 63% sea. Every map test passed, because they check separation, bounds and the crop, and none of them looks at what is actually under a marker. Placement by eye against a photograph is not something a unit test was ever checking — found by Dom looking at the screen
23. **A second marker in the sea, found by the test written for the first** — the opening Your Story bend sat off the end of the jetty at (22, 88), and each bend draws a visible dot. Nobody had spotted it. The fix for #22 included `land-mask.test.ts`, which flagged it on its first run. Worth noting the shape: the value of that test showed up immediately, on a case that had been shipped and looked at repeatedly

24. **The site was slow because of geography, not weight** (13 Sep). Supabase is in `eu-north-1` (Stockholm); Vercel had no region set, so every function ran in the default `iad1` — Washington DC. A Piazza request makes ~5 sequential hops to Supabase before its first byte, and every one crossed the Atlantic and back. Measured live: 200ms TTFB warm on the lightest page, 1.86s on a cold start. Reported as "slow on mobile" and investigated as an image/JS problem; both were checked first and both were fine (delivered images 21–96KB, JS modest, fonts self-hosted). **The report named the wrong layer and the investigation nearly followed it.** Fixed with one line: `"regions": ["arn1"]` in `vercel.json`. Stockholm rather than London on purpose — five database hops per request against one user hop, so the hops should be the short ones. Also: the station images were 28.5MB of PNG (now 3.1MB JPEG — delivered bytes unchanged, optimiser cold path and repo size fixed), and the Piazza hours query was a sixth sequential round trip after five parallel ones (folded in)

25. **Push sent to nobody in group rooms** (14 Sep). The sender took recipients from `chat_participants`, which only direct channels have; a group is everyone with portal access, per `can_see_channel()`. The test passed because its fixture inserted participant rows into `#general`, a state production never has. **A fixture that disagrees with production proves the wrong thing** — the fixture now matches, and the group path is tested against an empty table

26. **Live chat was dead for everyone from 13 to 14 Sep, and nothing said so.** The Sociale redesign added a reactions listener on the same Realtime channel as the messages listener, with a note to add `message_reactions` to the publication in the dashboard. That step was recorded as done and had not happened. Realtime refuses a whole channel when any one binding on it can't be served, so messages stopped arriving too; and the refusal comes as a `system` message *after* the client has reported `SUBSCRIBED`, on an event type nothing listened to — so the console stayed silent. Found by elimination: service-worker ruled out (can't touch WebSockets), the phone shown to open the socket (edge logs), the row shown visible under exactly the RLS check Realtime performs, the change stream shown to deliver the row to a service-role listener, and only then a probe that waited for the `system` message instead of stopping at `SUBSCRIBED`. My own first probe had made the same mistake as the code. Three fixes: the publication entry is a migration (guarded like `chat_messages`, asserted by the schema test, which the harness can now run because it creates the publication); messages and reactions are on separate channels; both channels log a `system` error. **`SUBSCRIBED` means the join was acknowledged, not that Postgres changes are flowing.** And a dashboard step is a step that can silently not happen: make it a migration

## Environment variables confirmed set in Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_FROM`, and since 14 Sep `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (push; see CLAUDE.md for why the public one needs a redeploy to take). **`ANTHROPIC_API_KEY` is never needed** — settled 3 Sep, see the AI decision above.

## Migrations
**Thirty-one on disk. All applied to live, and the CLI's history now agrees.** The fourteen from 1–3 Sep (six dated `20260901`, eight dated `20260903`) went in by hand through the SQL Editor while the CLI couldn't connect; the seventeen before them went through the CLI normally.

**This said "thirteen" for a week — it was always fourteen.** Counted from memory rather than from `ls`. A repair list off by one is exactly the kind of stale number somebody acts on, which is what the paragraph below is about.

**The pooler is fixed, not worked around (10 Sep).** `migration repair --linked --status applied` was run for all fourteen, `migration list` now matches on both sides, and `db push --dry-run` reports "Remote database is up to date". Nothing is owed.

**The root cause was a month-stale CLI, plus two self-inflicted faults that were never wrong at the same time.** `supabase link` had been failing with `SchemaError … inserted_at` — a CLI/API mismatch. The CLI was 2.112.0 from 7 August; upgrading to 2.117.0 fixed `link` on the first try. Underneath that, the `--db-url` attempts had failed for two *different* reasons in sequence: the first three used the bare username `postgres` (the session pooler needs `postgres.<ref>` to resolve the tenant, and fails with `28P01`, indistinguishable from a wrong password — which is why three password resets looked like the problem); the fourth used the right username but passed the password via `SUPABASE_DB_PASSWORD`, which `--db-url` ignores. **Every attempt had exactly one of the two things right, so each fix appeared not to work.** Worth remembering as a shape, not just as a Supabase fact: when two faults are found in sequence, the second fix is tested against the first fault still present.

**`npm run db:diff` needs Docker, which isn't installed here.** Unverified as of 10 Sep — the two proofs above were judged enough, since they answer whether the history is in sync. `db:diff` answers a different question (schema drift the migrations don't account for) and is still worth running on a machine that can.

**Before saying a migration is pending, check.** `ls supabase/migrations/` against what has been pasted, or `git show --stat` on the commit that supposedly added one. A stale "still to do" is worse than a missing one, because somebody acts on it.

## Standing rules, learned the hard way
- **Close every build session by walking through what shipped.** Open each new screen and use it, don't just read it. The 3 Sep walkthrough found five real user-facing bugs across six screens — all in code written that day, tested at every layer a test could reach, and described in commit messages as working. **The layers a test can reach are not the layers a member touches.**
- **Always confirm real testing is complete — actually done, not just described as done — before committing or pushing.**
- **Prove a test can fail before trusting it.** Reintroduce the bug, watch that test go red, restore. Twice this week a green test was proving nothing.
- **Assert that a mutation, or a file edit, actually applied.** A silent no-op looks identical to a passing check.
- **Sample before calling a suite green.** One run is not evidence.
- **Every click-through target needs exactly one unconditional route in.** Check it when the target is built, not when somebody can't find it. Three instances on this build, all the same shape: the profile form was reachable only when you had no profile or when your own card matched the current search, and `/milestones` was reachable only from a Piazza cluster that doesn't render until hours have been banked — so the member with nothing yet could never find the page explaining what they're working towards. A contextual route is worth having *as well*; it is not a route in.
- **Check conditional navigation for the state it forgets.** An affordance shown only in one state leaves the other states with no route at all. Twice on the directory screen: the profile form was reachable only when you had no profile, or only when your own card happened to match the current search — so a member who was listed without a photo, or who had searched, had no way in. When a link appears under a condition, ask what the other branch of that condition looks like.
- **When something is slow, measure where the time goes before touching what looks heavy.** The 13 Sep slowness report named mobile, images and JS; the cause was the function region, which none of those would have found. `curl -w '%{time_starttransfer}'` and the `x-vercel-id` header (`edge::function::id`) answered it in two commands. Check the region against the database's region on any new Vercel + Supabase project before anything else.
- **Check every table for the column-ownership trap.** RLS is row-level: a policy letting somebody update "their own row" lets them update *every column* of it. Three tables have had this — `members`, `pairings`, `handover_pack` — and each time the giveaway was a comment above the policy describing a restriction the policy cannot express. **Treat that comment as a bug report, and add a trigger.** Worth checking on every new table with a member-facing update policy, not just when something looks wrong.
- **A probe that stops where the code stops proves nothing about the code.** The live-chat probe (bug 26) first checked for `SUBSCRIBED`, exactly as the broken code did, and reported the channel healthy. When verifying a claim, the check has to go one step further than the thing being checked.
- **Anything that has to be done in a dashboard is a step that can silently not happen.** Publication entries, buckets, policies: write the migration, guard it for the local harness, and assert the result in `test:db`.
- For a build this size, start a fresh session per major step or per day rather than one marathon.

## Right now, exactly
**Steps 1–11 are done**, including the two-week check-in and Step 9's Archivio.

Next: **the admin Roadmaps section** and the richer roadmap structure it needs (months → focuses → actions, each action linked to a training, with its own comment box and a week-number dropdown). Then **the send-handler tests**. Then Step 10's remainder and Steps 12–13.

**Before anything else: three migrations are waiting to be pasted** — see Migrations above. Archivio and the check-in are built but won't work on live until they are.

**To pick this up fresh: `CLAUDE.md` + this file, nothing else needed.**
