# aOS — current state (5 October 2026)
*If this chat ever needs to hand off to a fresh one: drop in this file plus `CLAUDE.md`, the Build Brief, the Training Library doc, and whatever the latest Dom Build Plan looks like (that file is now owned by Claude Code directly, not maintained here). This document is the "where we actually left off," not the full spec.*

> **Editing note (3 Sep):** several updates to this file between 1–3 Sep were reported as made and silently weren't — the edit scripts used string replacement without checking the target matched, so a stale anchor printed success and changed nothing. This file was rebuilt from the git log on 3 Sep. **Assert the anchor exists before editing this file, or rewrite it whole.**

## WHERE WE ARE — 7 October 2026

**Seventy-eight migrations on disk, all seventy-eight applied to live and verified by reading each result back.** Test suite as of 7 Oct: **476 unit / 289 + 86 schema / 342 action / 98 browser**, build, typecheck and lint clean. **Everything is pushed**: `main` is at `5348d66` and Production shows it Ready. **Stage 3 is built and switched off** — all four remaining tabs, targets, benchmarks, traffic lights and the two panels, behind `SHIPPED_STAGE = 2`, proved by a browser test that runs the same app at the production flag and watches the Overview not change. **A published month is locked, and now keeps the figures it was published with** — the lock and the carried-figure snapshot are the whole of 7 October. **The Stage 3 switch stays off until Nina's final review, which happens once, at the end of Stage 6** (Dom, 8 Oct) — so what is left is Stages 4, 5 and 6, then that review, then the launch checklist.

**The work since 30 September is the reporting tool** — a second product inside aOS, for clients who are not aOS members. Stage 1 (schema, RLS, the metric list, the formula module) and Stage 2 (entry screens, the Overview, draft/publish, strategist notes) are both built and live. **Its own section below is the one to read**; it is large enough that it no longer fits in this summary.

**Stage 2's walkthrough has been done** (2 Oct, on Test Client): August and September entered, August published, checked signed in as the client in a private window. **The flow works and no draft figures leaked.** It found six bugs, all fixed — see the reporting section. The remaining piece of §11.2 is doing the same on a *real* retainer client, which means emailing a real invitation.

Since the last big handoff, five things landed: **peer pairing on real dates** (pick slots after the match; both told where they overlap the moment the second one picks), **the monthly recap** (aOS collates the month, Nina writes it outside the app, pastes it back, sends — verified end to end on live including the email), **admin password recovery**, **the deployment banner and keyless previews**, and **round 6** (Friday check-in email, roadmap inactivity nudge, the prize bar, the Sociale redesign).

**Three bugs found in production along the way, all fixed and all the same shape — something failing silently:** the day-7 pairing flag had never been set (a guard trigger refusing the service role); the recap's read tracking never ran (`cookies()` inside `after()`, which Next forbids during a render); and an email that looked broken was fine all along, being sent from a preview deployment that had no Resend key. Each one is written up in its own section below, with what the test harness could not have caught.

**What is not verified, and why:**
- The **Weekly Check-Ins room has never been seen in its open state** — it unlocks Mondays 2–3:30pm UK and nobody has been in it during a window.
- The **Friday check-in email** went out in its merged form for the first time on **2 October** — unconfirmed whether it arrived or read well. The wording is mine, not Nina's.
- The **hot seat month picker** needs a second month of sessions before it shows anything.
- **Milestone rewards** are deferred, not dropped — see the section below.
- The **audit questions** are still placeholders waiting on Nina, as are her content lists (quotes, videos).

**Live data is all test accounts.** Two member test accounts (`yungsl5dom@`, `dominicchentrens@`), Nina's own member account, and two admin accounts. No real members yet.

**On the reporting side there is one test workspace**, "Test Client", owned by `contact+test2@allegrobusinessservices.co.uk` — a working retainer-client login Dom controls, kept deliberately because it is the only way to see the product as a client sees it. It has a password set by Claude Code and not recorded anywhere; use `/forgot-password` to take it over. A second, `nina+test@`, was created by mistake and deleted on 30 Sep along with its workspace.

## RUNNING THE BROWSER TESTS (set up 6 October 2026)

Playwright, against a **local Supabase stack**, as four fake accounts.
Never against live and never as a real admin login — Dom's rule, and
`e2e/guard.ts` enforces it rather than trusting anybody to remember: it
refuses any Supabase host that is not `127.0.0.1`. Asked that way round
because "is this the local stack" has one answer, while "is this the live
one" needs a list somebody has to keep current.

```
colima start                      # after any restart — the VM does not come back on its own
npx supabase start                # the stack: Postgres, PostgREST, GoTrue
node scripts/seed-test-db.mjs     # four fake people, two fake businesses
npm run test:e2e                  # both widths
```

`colima stop` when finished, or it sits there using memory. `npx supabase
stop` leaves the data; `npx supabase stop --no-backup` throws it away.

**Why Colima.** The Supabase local stack is containers, and this machine
had no Docker, no Podman and no Postgres of any kind. Colima rather than
Docker Desktop: lighter, and no licensing question.

**Things that will bite again:**

- **Next 16 refuses a second dev server in the same build directory.** The
  lock lives there, so the test server sets `NEXT_DIST_DIR=.next-e2e`
  (`next.config.ts` reads it) and runs on port 3100. Without that, running
  the suite means killing the dev server you are working in.
- **`devices["iPhone 14"]` is WebKit**, which will not take
  `channel: "chrome"`. The phone project overrides `browserName` and
  `defaultBrowserType` to keep the iPhone's metrics on the installed
  Chrome. Real device emulation, not a small window — Chrome headless has
  a 500px floor and a "390px" window is a cropped desktop render.
- **Playwright transpiles specs to CommonJS**, so `import.meta` in a
  helper is a syntax error. Use `__dirname`.
- **The tests seed before every test, not once.** They type figures and
  publish months, so one leaves the next a different world — and the
  desktop project would otherwise decide what the phone project sees.
- The stack applies **every** migration in the folder, including ones held
  back from live. Local and live can therefore differ by a held migration;
  as of 6 Oct that is `20261006100000_opening_clients_wording`.

**Screenshots** land in `e2e/screenshots/<tab>/<name>-<width>.png`, full
page, both widths, overwritten each run.

## LAUNCH CHECKLIST — things that can only be done when there are real clients

Not pending work and not bugs. Each one needs a real client, Nina's eyes, or
a real month, and none of them can be finished before launch.

- [ ] **§11.2's last item: the reporting tool on a real retainer client** — two
      past months entered, one published, and the client reading it. Everything
      about it is proved on Test Client (Stage 2, closed 5 Oct); what is left is
      a client to do it with.
- [ ] **What a client sees on a month whose earlier months were never
      published.** Rewritten 7 Oct; the previous wording said a dash was
      "the safe answer and the one built", and neither half was true. The
      figure came out as a NUMBER worked out from a start the client could
      not read — 3 where they had been shown 25 — because `sum` is lenient
      about missing inputs. The strict `activeClientsAtEnd` fixed that, and
      the carried-figure snapshot (`docs/freeze-plan.md`, decisions 1–3
      approved 7 Oct) stops the figures being derived at read time at all,
      so a published month keeps what it went out with.
      **What is still open is the client who joins mid-relationship**, whose
      first months are never published and so have no snapshot to carry: a
      dash is honest, and is not obviously what they should see.
      **Decide before a real client reads a mid-relationship month.**
      (Dom, 6 Oct; corrected and narrowed 7 Oct. Both halves are asserted in
      `supabase/tests/client-experience.test.mjs`.)
- [ ] **Nobody joins until Stages 4, 5 and 6 are built** (Dom, 8 Oct). No aOS
      member, no Chiarezza attendee and no new retainer client starts on a
      half-finished tool, and Nina reviews the whole of it once rather than
      stage by stage. The Stage 3 flag stays at 2 until that review.
- [ ] **Regenerate `docs/nina-review/` at the end of Stage 6** so it covers
      every stage, with "Decided on Nina's behalf" as its first section.
      `npx playwright test nina-review.spec.ts` rebuilds the pictures; the
      README is written by hand. Last built 7 Oct, Stage 3 only.
- [ ] **Trend charts and the Proven marker still read live history.** A
      chart can change if an earlier month is unpublished. The snapshot
      freezes a month's own figures and what it compares against; freezing
      a chart would mean storing its whole series on every month, which is
      a different and much larger thing. Flagged rather than solved
      (Dom, 7 Oct).
- [ ] **If an offer price is wrong on a published month, the fix is
      unpublish, correct, republish** — and the client gets the "has been
      updated" email. A funnel month captures its offer's price on the
      first save and a published month never changes it by any route, so
      there is deliberately no quiet way to fix one. **Nina should know
      this before the first real client**, because the alternative she
      might expect — "just change the price and it will catch up" — does
      nothing. (Dom, 6 Oct.)
- [ ] **Nina reads the publish email's wording before the first real one goes
      out.** `src/lib/reporting/publish-email.ts` holds every word of it, in one
      file, specifically so she can change it without touching a screen. The
      current wording is Claude's draft, approved in shape but not in voice —
      the same gap the recap email had until she rewrote it on 23 September.
- [ ] **The September draw prize still reads "test".** It needs a real prize
      before a real month's draw runs.
- [x] ~~A reporting client's display name has no admin screen.~~ **Fixed
      5 Oct** (`cfc1b2d`): "Client contact's name" is on the Edit details
      form. Test Client's contact still reads "Nina" in the live data until
      somebody changes it, which is now a thirty-second job rather than a
      database edit.

## What's genuinely built and live
- **Infrastructure:** Supabase, GitHub, Vercel, all connected, `aos.allegrostrategia.com` live.
- **Steps 1–7:** schema/auth/RLS, design system, onboarding, Piazza + La Strada, weekly log/timer, hot seat, training library. All verified against the live database. Audit questions are still placeholders pending Nina.
- **Step 8 (admin panel) — complete.** Member lifecycle, roadmap editor, **content upload** (browser-straight-to-storage via signed URL — a Server Action body can't carry a video), **the monthly draw**, and **hot seat challenge review** (the prep sheet lists every active member, not just those who submitted — §5's fallback was unreachable otherwise).
- **Step 10 core — the hours-reclaimed ledger.** Dated rate history per build plus an append-only weekly ledger, so retiring a build never shrinks hours already banked. Accrual runs off `due_jobs`, replans four weeks back daily, idempotent on (member, week). **Two gates, both required and both settled: ten hours logged AND the log submitted.**
- **Step 11 — complete and verified live.** Chat (channels, DMs, voice notes through a signed-URL route, Realtime, read state, unread email), the member directory (search, listings, chat-through button), and peer pairing (availability grid, rotation matcher, both notification emails, day-7 flag, coach branch).
- **Step 12 done; Step 13 done but for one piece.** The reveal document, the flourishes (flip counters, the FATTO stamp, self-drawing map lines) and the log's week navigation are all built. **The Vespa intro video on first login is not** — there is no asset for it. It is the only thing left in the open list.
- **The reporting tool, Stages 1 and 2.** A second product inside aOS for clients who are not members. Live, with its own section below.
- **Installable to the home screen.** Manifest, real brand icons, and an install prompt — a button where the browser supports it, Share → Add to Home Screen on iOS, which has no install API at all. Confirmed on a real iPhone.

## Verified live, by hand, with real accounts and real email
- Library upload → publish → playback as a member.
- Voice note recording and playback, **as the recipient** (the sender could always read their own folder, so testing as yourself proves nothing).
- Realtime live updates, name resolution, directory search, opening a DM from a listing.
- Peer pairing end to end, including the day-7 guard in both directions: with `met_at` set it skipped; with `met_at` cleared it sent. ~~and set the flag~~ — **disproved 20 Sep:** the live rows show `flagged_at` was never set; the guard trigger refused the service role and the runner didn't check (peer pairing section). The "checked on the row" claim was true only for the skip half.

## DEFERRED, NOT DROPPED: milestone rewards
**Real unlockable rewards at each milestone threshold (50 / 100 / 250 / 500 / 750) are intended.** They are not scoped, not designed and not built — and that is a deferral, not a decision against them.

Until they exist, the copy says **"distance to your next milestone"** rather than §2's "distance to next unlock". Changed 3 Sep: the brief uses "unlock" throughout and never says what is unlocked anywhere, so the original wording promised members something the product didn't have. The mechanic underneath is unchanged.

**When rewards are scoped, `/milestones` is where they go.** The thresholds, the crossing dates and the progress bands are already built; a reward hangs off an existing step rather than needing the page rebuilt. The copy reverts to "unlock" at the same time, and not before.

This is its own section rather than a line in the open list because it is a product promise waiting to be defined, not a small piece of work waiting for a slot.

## THE REPORTING TOOL — STAGE 2 CLOSED 5 OCT; STAGES 1 AND 2 LIVE (30 Sep – 5 Oct)

Brief: `docs/reporting/reporting-tool-brief.md`, mockups beside it. A second product inside aOS: a monthly report for **retainer clients, who are not aOS members**, plus self-serve versions for members and Chiarezza attendees. Commits `4562f5d` → `3798361`.

**Read the brief's §11 for the stages.** Stage 1 (foundations) is done.
**Stage 2 is closed, 5 October 2026** — every §11.2 item was done on live by
Dom against Test Client: two months entered, one published then both, the
client view verified signed in as the client, the strategist note, objectives
and the client's replies all written and read back, and the publish email
received in the inbox. Stage 3 onwards is not started.

**One part of §11.2 is deferred rather than met: a *real* retainer client.**
There are none yet — aOS has not launched — so Test Client is as real as it
gets today. It is on the launch checklist above, not pending work.

### The identity decision — confirmed by Nina 30 Sep, do not change without asking

Retainer clients, Chiarezza attendees and Elize get an `auth.users` account and **no `members` row**. The weak reason is that a members row might make them an admin; it wouldn't, `role` defaults to `member`. **The real reason is that `has_portal_access()` is a MEMBERSHIP gate, not an authentication one, and three shared surfaces read it with no ownership check:** `can_see_channel()` grants every *group* channel, `member_profiles` is the directory, and `draws` and `hot_seat_sessions` are open to anyone passing it. It is `status <> 'cancelled'`, so *every* status admits them. One members row created for convenience puts a paying client inside Piazza Sociale.

Asserted by test, not comment: each of the three signs in and must read zero rows from all five surfaces, which are seeded with real content first.

**The consequence, and why routing has a second resolver.** The codebase assumed every auth user had a members row. `src/lib/auth/report.ts` is the resolver for the ones that don't, `src/app/reporting` is its own route group outside `(portal)`, and **`src/lib/auth/landing.ts` is now the single answer to "where does this login go"** — used by the root page, with the proxy and the sign-in action both pointing at `/`.

### What is built

- **17 `report_` tables**, ten migrations, all applied. §9's data model exactly.
- **174 metrics**, generated from the brief's §5 tables by `scripts/generate-report-metrics-seed.mjs`. **Do not hand-edit the seed migration** — the schema test runs the generator with `--check` and fails if you do.
- **`src/lib/reporting/formulas.ts`** — every calculation in §5 and §6, pure, 34 tests against the brief's own worked examples. Three conventions written at the top: missing returns `null` (a dash, never 0%), **percentages are 0–100 throughout**, money is ex-VAT.
- **`calculate.ts`** is the bridge from named arguments to metric keys; **both the entry screen's live card and the report go through it**, which is what §9 asks for.
- **Entry screens** for Social Media, Email, Leads & Conversions, Offers and Financials — one generic page driven by `report_metrics`, plus a dedicated Offers screen because its figures hang off a row rather than a month.
- **The Overview**, strategist notes, draft/publish, and an admin screen at `/admin/reporting` for creating clients and assigning team members.

### Decisions worth not relitigating

- **Publishing is Nina's alone** (her call, 30 Sep). Guard triggers cover INSERT as well as UPDATE, so a team member cannot create an already-published period.
- **`owner_user_id` is deliberately not unique** — nobody knows whether a retainer client runs two businesses, and workspace and login are already separate concepts, so a second one needs no migration.
- **Launches carry their own `published_at`**, on the same rule as a month. The brief is silent; the alternative was a client watching their launch page fill in mid-entry.
- **Social Media figures are stored per platform**, created on first save as "Instagram", so a second platform later is a new row and not a backfill.
- **Brand**: keep the approved mockups' *layout*, render it in L'Editoriale (Nina, 30 Sep). The brief's own §3 palette table is the pre-13-Sep look and is superseded by `CLAUDE.md`. **Do not rebuild the layout.**

### Two mockup arithmetic errors — build to the brief, not the mockup

§12 already records the launch planner showing 600 sign-ups where §6.6's formula gives **1,277**. The second was found on 30 Sep: **mockup 2 prints a 6.9% engagement rate where §5.2's formula gives 9.34%** — 6.9% is likes and comments over reach, leaving out the saves and shares the formula includes. Both wrong figures are pinned by tests. Dom is raising the mockups with Nina separately; **do not "fix" the formulas to match them.**

### Open questions and known gaps

- **`client_experience_active_clients_at_start` cannot be built as specified.** §5.8 calls it "last month's active at end" *and* says "the very first month asks for active clients at start as a one-off input" — a field pulled in most months and typed in one, which the schema refuses outright (`report_values` will not store a pulled metric). Needs Nina's decision. Named in `PULLED_NOT_IMPLEMENTED` with a test that fails if someone quietly implements it. Stage 3.
- **Publishing does not email the client.** §8 wants it. A retainer client has no `members` row, so their address is in `auth.users` and needs the service role. The publish card says so rather than implying otherwise.
- **`report_values`' unique rule is on a `coalesce()` expression**, which PostgREST cannot target with an upsert, so saving is read-then-write. A `nulls not distinct` index would make it one upsert — worth bundling with the next migration Nina reviews.
- **Nina has two auth accounts** (`nin…@gmail.com` from 3 Sep, never confirmed, and one on the Allegro domain). Not urgent.
- Stage 3 owns the charts, target bars, traffic lights and "Look at these first" — all of which need targets, benchmarks and twelve months of history.

### The Stage 2 walkthrough, 2 October — six bugs

Dom ran it on live against Test Client: August and September entered,
August published, then checked signed in as the client in a private
window. **The flow works and no draft figures leaked.** Six bugs, and the
shapes are worth more than the list.

1. **Every login went to `/piazza` after setting a password.** So a
   retainer client's first ever sign-in, straight after choosing their
   password, landed on "Your account isn't ready yet". Three places
   defaulted there — the sign-in action, the confirm route and the login
   page — which is why fixing it twice before had not fixed it. They all
   send people to `/` now and let the root page decide.
2. **Clients were offered months they cannot read.** The dropdown listed
   an unpublished September, the arrow stepped into it, and every section
   then claimed it "wasn't part of this month's report" — untrue; the
   sections were full, just not theirs yet. A client now gets their
   published months only, the arrows walk that list rather than the
   calendar, the DRAFT label is not rendered for them, and a month reached
   by URL says plainly that it is not ready.
3. **Revenue and Profit said "No month to compare"** on a month whose
   predecessor had figures: last month's offers were never worked out.
4. **"Still to fill in" showed Offers 0/3** however much was entered,
   because completion used a month-level lookup and Offers stores against
   each offer.
5. **The Financials entry card showed dashes** where the report showed
   real figures — it called `calculate()` without the offers. The two
   disagreeing is the one thing §9 exists to forbid.
6. **The "Worked out for you" panel covered the save buttons** at desktop
   width (fixed separately in `da9345b`). A sticky element is held by its
   containing block, and the save bar was a third item in the same grid.

**3, 4 and 5 were one bug wearing three hats:** revenue pulled from Offers
was worked out in some places and not others. Worth checking every reader
of a pulled or per-entity figure when one of these turns up, not just the
screen that reported it.

### The overnight run, 2–3 October — audit and two plans

Run on Dom's instruction under hard limits: nothing pushed, no migration applied, no write to live data, no email sent. **`docs/reporting/audit-2026-10-03.md` is the record**, and its first section is a morning summary — read that before this.

**The reporting tool was audited against all six of §13's hard rules.** Four came back clean and are recorded so they are not re-audited: one route per clickable thing, a client seeing no other client and nothing admin, drafts unreadable at the database, and no VAT arithmetic anywhere.

**One real bug found and fixed** (`b4c9ce3`): the admin client list read every period of every client unbounded. PostgREST stops at 1,000 rows and says nothing, so past about forty clients with two years of history the page would have rendered perfectly with quietly wrong counts. `fetchAllPages` now pages, with six tests.

**Four findings deliberately left unfixed**, because they are client-facing or need a migration — all written up in the audit with the SQL where there is any:

1. `report_values.entered_by`, `entered_at` and `source` are editable by any editor. Not a leak — a falsifiable audit trail, the same argument that made `report_csv_imports` append-only on 30 Sep. Needs a guard trigger, and one design question about whether the save should keep rewriting `entered_by`.
2. Nothing on screen says the money figures should be ex-VAT. A client entering a gross invoice total produces a wrong report that nothing can detect. A few words of copy, but client-facing.
3. `entered_by` is `on delete set null`, so removing a login silently blanks who entered every figure they typed. `report_notes` already solved this by storing the name alongside the id.
4. `unassign_report_team_member` exists in the database and **nothing calls it** — an assignment can be made and not undone without editing the database. The same shape as the missing edit-client form that blocked the walkthrough.

**Two plans written for Nina**, both as documents rather than in the repo:

- **The three remaining §8 pieces** — objectives, the client reply, and the email on publish. Amended tonight on Dom's instruction: the two "choices already made" became questions, the guard migration is shown before→after against what is actually running, and the email's link is specified to come from the live site's address and never the request origin — the invitation bug again.
- **Stage 3** — the four remaining categories, targets, the benchmarks admin, traffic lights, "Look at these first", and all twelve charts §5 asks for. One small migration. Includes a scoped **"charts first"** option: five of the twelve work on a single month of figures and need no database change, so they could ship straight after Stage 2.

**One thing that had been wrong since the first document.** A doc byline of "Prepared by [me]" resolves to the account holder, which is Nina's account — so the migration review she approved on 30 September reads "Prepared by Nina for Nina". Fixed in both current plans; the approved document was left alone deliberately.

### 5 October — STAGE 3 BEGINS: the five single-month charts (`e6633d4`, `7c10ea8`)

Approved as a release of its own ahead of the rest of Stage 3, because
these five need only one month of figures. Leads by source on the Overview
and on Leads, share of revenue by offer, effective hourly rate by offer with
the target line, and the cost breakdown on Financials. Plain SVG,
server-rendered, no charting library.

**The rule that holds them together: no chart does its own arithmetic.**
Every value comes from the formula module through `calculate()` and
`calculateOffer()`, so a chart and the card beside it cannot disagree. Dom's
condition, set after correcting the hourly rate from revenue ÷ hours to
**(revenue − other direct costs) ÷ hours** (§5.9). There is a test for the
case where the two differ — an offer with other direct costs entered gives
£125, where the wrong formula would have drawn £150.

**The palette was computed before anything was drawn with it, and two pairs
failed.** This is the finding worth keeping:

- **blush/lemon separate by 0.5 under simulated protanopia** — which is to
  say not at all — and by 13.1 under normal vision, below the floor for
  full-colour readers too.
- **gold/blush** fails that normal-vision floor as well, at 13.8.

Both would have looked perfectly pleasant on screen to whoever drew them.
**The series order is navy, orange, gold, sky, charcoal**, where every pair
clears the thresholds and the worst is 15.3. Blush and lemon stay
decorative; they are not series colours. `scripts/check-chart-palette.mjs`
is what says so — run it before adding one, and read the numbers rather
than the colours. `--aos-charcoal` is now declared, having been in
CLAUDE.md's palette and never in the CSS.

**Only navy and charcoal clear 3:1 against the cream card** (orange 2.63,
gold 1.27, sky 1.44), so every fill carries a 2px cream separator and a
hairline ink edge, and every donut carries a legend with the value beside
each name. That obligation is not optional and colour alone does not meet
it.

**Two faults found by looking at the renders, not the code.** Slices were
coloured by position *after* sorting by size, so an offer that overtook
another would have changed colour between two months — colour follows the
entity, never its rank, which the plan said and the first code did not do.
And rounded shares came to 101%; largest-remainder now, so they sum to 100.

**The target hourly rate joins the admin edit form**, because nothing had
ever set `target_hourly_rate` and §5.9's dashed line could therefore never
appear on anybody's chart. The feature was unreachable rather than missing.

**The client's Overview no longer leaves a third of itself empty.** "Still
to fill in" and the publish card are an editor's, so a client's right-hand
column rendered nothing. The chart moved into it rather than the prose
stretching across — a note card at 1300px is a worse read than one at 850.
On a phone the chart sits with the KPI strip, because stacked it had been
landing after the reply box, inviting a comment on figures the client had
not been shown.

Everything rendered at 1440 and 390 through CDP device emulation and looked
at. No horizontal overflow at either width.

### 6 October — Stage 3: Client Experience and Ads, behind the flag

Both built, tested and deployed, and **neither is visible to anybody**:
`PRODUCTION_STAGE` is still 2, so their tabs have no route. Dom looks at
each on localhost before that number moves.

**Client Experience** is §5.8's opening figure and the four figures it
unblocks — retention, churn, upsell and active-at-end, all of which had
been null on every month of every client because "active clients at
start" is a *pulled* metric and so can never be typed. Migration
`20261005140000` applied 5 Oct. The chain is in `client-flow.ts`: the
earliest stored opening figure wins, and every later month adds who
joined and subtracts who left. The box appears on **one** month, and a
second figure is named as not in use rather than ignored.

**Ads** is §5.7: one block per campaign, each with a goal, and the goal
decides whether its spend counts towards cost per lead — £4.50 against a
blended £6.00 on the §10.2 sample. **A campaign with no goal is left out
and said to be left out**, never counted by default. Reach is shown per
campaign and never summed. Leads now reach the Leads page without being
typed twice.

**Three bugs found by the browser tests, within minutes of each other.**
All three had passed every unit test, because none of those renders a
page or looks at one:

1. **A ReferenceError on the Client Experience entry page** — `note` used
   by a filter declared above it — so the page rendered nothing at all.
2. **§9 again.** The entry card showed "New clients —" and an "active
   clients at end" of 15 where the report said 4 and 19: the live card
   reads boxes on its own screen, and "new clients" lives in Leads. The
   page now hands it the figures its formulas reach for.
3. **Money was rounded to whole pounds everywhere**, so cost per click
   printed "£0" and cost per lead "£5". The §10.2 example is precisely
   £6.00 against £4.50, and at whole pounds the difference was invisible.
   Small money keeps its pennies now — under a thousand and not a round
   number.

**The third one is client-visible and went out with this push.** On Test
Client's live Offers page the effective hourly rate reads **£107.14**
where it read £107; nothing else on live changes, because every other
figure there is a round number. Flagged to Dom rather than slipped in.

**And one the figure-agreement tests found on their first run**, live
since Stage 2: Social Media's figures hang off a platform entity and the
entry screen read them back without it, so **every box came back empty
after a save** and "Worked out for you" showed dashes beside a report
full of figures.

### 6 October (evening) — Stage 3 finished, unpushed

Eleven commits, none pushed, no live migration applied. Built against the
local stack with browser tests at both widths throughout.

**The four tabs.** Client Experience and Ads were done earlier; Funnels
and Trial Reels followed. Funnels captures its offer's price on the
first save of a month and never moves it on a published one, so a price
rise cannot rewrite a report the client has read. Trial Reels has the
top-three hooks and b-roll with a Proven marker at two months, and
deliberately no "below benchmark" note.

**Then targets, benchmarks, traffic lights and the two panels.** Every
word in "Look at these first 👀" and "What went WELL this month" is
Nina's, from one file, asserted character for character.

**What the browser tests caught that nothing else could.** Five bugs,
and the pattern is worth more than the list: every one was invisible to
tests that do not render a page and read it.

1. Two ReferenceErrors from a block placed above the thing it reads —
   the Client Experience entry page and then the Overview, both
   rendering nothing at all. **Twice in two days: inserting a block near
   related code is not the same as inserting it after its dependencies.**
2. The entry card disagreeing with the report on "new clients".
3. Money rounded to whole pounds, so £0.14 printed as "£0".
4. A category with figures that hang off a row reading as an empty
   month — Offers said "Nothing for August" above four units sold.
5. **A sentence that said the opposite of what happened:** two fewer
   clients leaving came out as "2 MORE clients who left — stunning".

**Three things the harness could not have found either**, all from the
shim quietly lacking something: `.delete().select()` returned null so
every checked delete looked refused; `.or()` did not exist so targets
could not be read at all; and `report_top_items` had no delete policy,
so an editor clearing a line was refused in silence.

### 6 October (night) — Stage 3 pushed, switched off

Sixteen commits, all pushed. `main` is at `6854a4d`, confirmed Ready in
Production from the deployment list — not from a content fingerprint,
which called a healthy deploy stalled on 5 Oct and is not to be used again.

**The benchmark columns are on live.** `20261006190000_benchmark_reply`
applied through the Management API and verified by reading the columns
back: `benchmarks_set_at timestamptz` and `benchmarks_unmatched text[]
not null default '{}'`.

**Nothing in the push reads anything live does not have.** Checked
rather than assumed, because the whole point of a gated release is that
production keeps working: every `.select()` in the sixteen commits was
listed and every column checked against `information_schema` on live.
The one dependency live is missing is the top-items delete policy, and
the code written for it fails honestly — an editor clearing a line is
told "it needs an admin", and the page it is on 404s at stage 2 anyway.

**The live check, as Test Client and nobody else.** A one-time magic
link through `/auth/confirm`, the 5 October method, no password changed
and no admin session. The Overview and all six Stage 2 tabs across both
published months, at 1440 and at 390: every one HTTP 200, not one word
of Stage 3 anywhere in the rendered text, and `/reporting/targets`,
`/reporting/benchmarks` and `/reporting/ads` all 404. The script is
deliberately **not** in `e2e/` — those specs type figures and publish
months, and a stray `npx playwright test` pointed at live would do that
to a real report. It only navigates and screenshots.

#### A published month is not locked. Anywhere.

Dom asked, before approving a delete policy on `report_top_items`,
whether insert and update were blocked on a published month — because a
delete that was not would let a line vanish from a report a client had
already read. He asked for the wider answer too if the narrow one was no.

It is no, and it is wider. **Every write policy on `report_values`,
`report_top_items` and `report_notes` asks `report_can_edit(workspace_id)`
and nothing else, and no trigger adds a publish check.** The only two
places a published month holds still are its own publish columns
(`report_periods_guard_publish`) and a funnel's captured price, which is
application code. So Elize can change a published figure today and the
client's report changes under them, silently.

`supabase/tests/published-months.test.mjs` records that rather than
closing it: an editor changing a published figure, rewriting a top-three
line, and clearing one. They pass today and are written to fail the day
somebody locks it, so whoever does will see exactly which behaviours
they changed. Proved by installing a publish guard on the two tables in
a scratch copy — **the figure and the rewrite flipped to failing; the
clear did not, because a delete is its own event.** That last part is
Dom's original point, demonstrated: an insert/update lock would leak.

**The delete policy stays unapplied until Dom decides.** The question is
not really the policy, it is whether a published month should be
editable at all — and that is a decision about what a client is owed,
not a schema detail.

#### Nina's two sentences for a figure where falling is good

The safe option taken on the 5th — say nothing at all about churn, cost
per lead or clients who left — is replaced by her words, given on the
6th:

> {metric} down {n} - exactly the direction we want
> {metric} up {n} - not the direction we want, let's dig into WHY

One shape rather than her count/rate pair, because stating the change as
a change reads correctly in any unit. `{n}` is formatted as the card
formats it, so cost per lead keeps its pennies, and it is always
positive — the direction is in the word. Tested on all three figures in
both directions, with four mutations checked (panels swapped, sign left
on, sentences swapped, the branch removed so the old bug returns), each
caught by three tests. The browser shot of a panel with one of each is
`e2e/screenshots/overview/08-good-down-both-ways-*.png`.

**And a thing worth knowing: `npm run lint` had been reporting 707
errors from compiled output.** `.next-e2e-stage2`, the second browser
server's build directory, went into `.gitignore` when it was added and
not into the eslint ignores beside `.next-e2e`. Enough noise to hide a
real one, which is the only reason to run it.

### 7 October — a published month stops changing

Dom's decision, after the 6 October finding that nothing held one still.
**Corrections go unpublish → fix → republish**, and republishing sends the
"has been updated" email. Four migrations, all applied to live and verified
by reading each result back rather than trusting an exit code.

**The lock** (`20261007100000`). Insert, update AND delete on
`report_values`, `report_top_items`, `report_notes` and `report_targets`,
on a published **retainer** month. All three verbs because a lock over two
of them leaks through the third — proved on the 6th, where a guard over
insert and update left clearing a top-three line working. Admin and the
service role pass, as every guard here does.

Four things in it that are not obvious, and each has a test that fails
without it:

- **Retainer only.** A self-serve client is also their own editor, so an
  unscoped lock would be a trap: one `published_at` on an `aos_member`
  period and they are shut out of their own figures, behind an unpublish
  button only an admin can see.
- **A client's reply is carved out by name.** Publishing is what *creates*
  the reply box; a blanket lock on `report_notes` would delete §8's
  conversation outright.
- **An update is checked against the month it came FROM as well.** Dragging
  a figure out of a published August into a draft September would otherwise
  pass — the column-ownership trap in its other shape.
- **On `report_notes` an update is judged by what the row IS**, not what it
  is becoming, because this trigger sorts before `report_notes_guard_update`
  and would otherwise answer a question nobody asked.

**A standing target is NOT locked, and that is a decision.** It belongs to
no month; a guard refusing it whenever any month was published would make
targets uneditable forever after the first report. It still moves the bar on
every published month without one of its own — for the freeze plan to close.

**Two delete policies shipped inside the lock**, because the guard is what
makes a delete policy safe to add. `report_top_items` had none (an emptied
line was refused in silence) and neither did `report_targets` — so clearing
a target had been **admin-only since Stage 3 was written**, with Elize
getting "A target could not be cleared". Unshipped, so nobody met it.

**The screens** stop inviting a change they cannot take: one disabled
`<fieldset>` over the whole entry page, native so it catches controls added
later; the Overview's note and objectives use the `canWrite={false}` path
those components already have (§13's "removed, not hidden"). Nina gets the
**Unpublish to make changes** button inline; Elize is told whose it is
rather than given a button that would refuse her.

#### An editor could put words in the client's mouth

Dom asked, reviewing the lock, whether anything stopped Elize writing a
`client_reply`. Nothing did. `report_notes_write` asked
`report_can_view(workspace_id)`, true for a team member; `author_id` is
pinned to the writer, but **`author_name` is free text and it is what the
screen prints**. A reply signed "Bella Rossi" landed on the client's own
published report. Proved before the fix was written.

Two migrations closed it. `20261007110000` stops a team member authoring one
at all — in the **policy**, not the guard, because "is this a reply" and "who
may write a reply" are different questions and asking one in two places is
how two answers drift. `20261007120000` then takes the choice away from
everybody: a trigger derives the signature from the author's grant, or their
`members` row for an admin, and a second trigger holds it still afterwards.

**An admin is not stopped by a policy and cannot be** — `report_notes_all_admin`
is `for all` and Postgres ORs permissive policies, so Nina never reaches the
CASE. She can still insert the row; it comes out signed with her own name.
Checked against live before applying: all six notes there already carried
exactly the name the trigger derives, so it rewrote nothing.

#### Unpublishing empties the months after it

Found by a browser test, then measured. A client's figures are computed from
the months **they** can read, and `getTrend` uses the member-facing client,
so RLS applies. Taking July back to draft changed the client's **still
published** August:

| | before | after |
| --- | --- | --- |
| Active clients at start | 22 | gone |
| **Active clients at end** | **25** | **3** |
| Retention rate | 90.9% | gone |
| Churn rate | 9.1% | gone |

Three figures vanish and one **was wrong**: `sum` is deliberately lenient
(`present.length === 0 ? null : …`), so "start + new − left" computed from a
start it could not read. A client reading mid-correction was told they ended
August with 3 clients.

Two answers, both Dom's. **Now:** a warning beside the Unpublish button,
before the click — *"[Later month] uses figures from this month. Until you
republish, some of its figures will be missing. If you change anything here,
republish [later month] too."* And the **strict `activeClientsAtEnd`**: a
dash unless all three inputs are known. The fix is local to that one formula
— changing `sum` would break the cases its leniency is right for. **Live
impact: none**, computed with the real module against the real figures;
both published months already showed a dash, because `left` is unset and
`difference` was always strict. **Later:** `docs/freeze-plan.md`.

#### An entity is retired, never deleted

`report_values.entity_id` and `report_targets.entity_id` were both
`on delete cascade`, so deleting one offer would delete every figure ever
recorded against it — rule 7 inverted. Now `on delete restrict`
(`20261007130000`), with `deleteEntityMessage` ready for the day a delete
button exists, matched on **SQLSTATE 23503** rather than Postgres's wording,
which names the constraint and has changed between major versions.

The obvious risk, checked rather than assumed: `report_entities` cascades
from `report_workspaces`, so a restrict here could have made a workspace
undeletable. It does not — Postgres removes the referencing values in the
same statement. Both halves are tests.

#### The panels: two figures that are one event

Dom, 7 October: "when two related figures move together (Issues raised and
Issues per 10 clients), show only one sentence, the plain count." **The test
is the panel** — same panel means one event told twice, so the count stays
and the rate goes; different panels (new clients up, close rate down) is two
pieces of news and both stay. Nine pairs, keyed by metric rather than label,
with a schema test checking every key against `report_metrics`.

#### Two false greens in one day, both in the checking

Worth more than the features. **A suite reported "92 passed" when it had
failed 12** — the exit code came from the `tail` at the end of the pipe, not
from Playwright. And a wait loop reported "done" while the suite was still
running, because `pgrep -f "playwright/cli.js test"` does not match the
process Playwright actually runs. Both were caught, but only by looking
again. **Capture the runner's own exit code (`cmd > log; echo $?`) and wait
on the summary line, never on a process name.**

### 7 October (later) — a published month keeps what it went out with

`docs/freeze-plan.md`, decisions 1–3 approved, built, applied and live.
The lock stopped a published month being edited; this stops it being
**recomputed**, which was the hole the lock uncovered rather than caused.

**One column**, `report_periods.carried jsonb`, written by `publishMonth`
with the service role and read in preference to the live walk once the
month is published. It holds what the month needs from outside itself: the
opening-figure chain resolved, the previous month's figures and **which
month those were**, the targets and benchmarks it was drawn against, and
the entity names and campaign goals. Decision 2 means it also closes the
two holes the month-keyed lock could not reach — a standing target and a
benchmark belong to no month.

**Decision 3: everybody reads the snapshot on a published month**, editors
included, so Nina and the client see the same report (§9). The live view
she wants while correcting is the draft view, which unpublishing gives her.

**`carried` is in `guard_report_period_publish`'s protected list**, insert
and update, beside the email columns. Without it the guard is silent about
the column and `report_periods_update_editors` admits the row — the
column-ownership trap, on the column added to close a gap.

**Three things found by building it, each worth more than the feature:**

1. **Freezing the figures was not enough.** The before/after screenshots
   Dom asked for showed August holding July's frozen numbers and still
   saying "No month to compare" on every card, because `previousLabel`
   comes from the previous month the VIEWER can see and a client sees
   published months only. `carried.previousMonth` is the fix. No code test
   had caught it; the screenshots did, immediately.
2. **The confirm step for publishing out of order was worthless in
   `useState`.** Playwright clicked before hydration and the month
   published on the first click — React runs a form `action` whatever an
   `onSubmit` handler does with the event, and a `type="button"` step would
   be dead without JS. The server refuses the first attempt now.
3. **The seed publishes by writing `published_at` straight into the
   table**, so its published months carry `{}` — which is exactly the state
   live was in before the backfill, and which correctly falls back to the
   live walk. A test that had not noticed would have been measuring the
   fallback rather than the freeze.

**`{}` means "work it out live", not "a snapshot saying nothing."** A month
the backfill missed, or one published before the column existed, must not
go blank for want of a row nobody wrote. Asserted through the real
`getMonthFigures`, not the parser alone.

#### The backfill, and how it was checked

`scripts/backfill-carried.mjs`, dry-run by default, retainer workspaces
only. It reuses `computeCarried` rather than reimplementing the
opening-figure walk in SQL — §9's rule is that two implementations of the
same arithmetic disagree, and this one would disagree silently.

Run against live on 7 October, two months, after a dry run whose output was
checked line by line against what the screens showed:

```
  wrote  Test Client 2026-08-01 — start=— prev=0  vs=none       entities=2
  wrote  Test Client 2026-09-01 — start=20 prev=39 vs=2026-08-01 entities=2
```

`vs=` is named rather than counted precisely so it can be checked: "none"
has to mean "No month to compare" on screen, and it did — August showed six
of those and September six "vs. August", before anything was written.

**Then proved, not asserted.** All six Stage 2 tabs were captured as Test
Client before the backfill and again after the deploy; `diff -r` on the
twelve files is empty. Every figure and every comparison label is identical,
with live now reading snapshots instead of computing.

**August's frozen "start" is a dash, and that is correct.** Test Client's
opening figure sits on September rather than on their first month, so
August has never had a start to show. **If the opening figure is ever moved
to August, August will not pick it up until it is republished.** That is
the design, not a bug: a published month keeps what it went out with, and
republishing is the way to change it.

#### Still live history, on purpose

Trend charts and the Trial Reels "Proven" marker read across months by
design. Freezing those would mean storing a chart's whole series on every
month. A client's trend chart can still change if an earlier month is
unpublished — on the launch checklist, flagged rather than solved.

### Stage 2's closing check, 5 October — as the client, on live

Dom walked the whole thing through on localhost and then on live, admin and
client side. The last check was Claude's, **signed in as the client and
nobody else**: a one-time magic link for `contact+test2@` exchanged through
the app's own `/auth/confirm`, no password changed, no admin session used.
Twenty-two assertions, all against the HTML the server actually sent —
because "removed from the page" and "hidden with CSS" look identical in a
browser and only one of them is what §13 asks for.

What it confirmed: August and September both readable and published; the
strategist note present and **signed with the admin's own name** (the
5 October signature fix, seen from the client's side); the two filled
objectives numbered 01 and 02, the emptied middle one renumbered away
rather than left as a gap; both client replies there with the reply box
under them; no DRAFT label; no `/admin` link, publish control, entry link,
workspace switcher or "Still to fill in"; sign-out reachable; and their own
business name on the page as the positive control.

**What it found, and it is data rather than code:** Test Client's client
grant is named "Nina", so that login's own replies render signed "Nina".
The code is right — a reporting client has no `members` row, so the grant's
`display_name` is the only name the app has for them — but there is no admin
screen to correct it. On the launch checklist.

**Also confirmed on live:** September's publish email was accepted at
16:00:36Z on 5 Oct, to `contact+test2@`, `email_error` null. The first real
send, through the real sender, into a real inbox.

**Third probe mistake of the day, for the record:** the first run reported
the reply box missing. It was there — the check looked for the card's title
with an `&rsquo;` apostrophe and React had rendered an ASCII one. Rewritten
to assert on the form's own fields rather than its prose.

### 5 October — §8's last three pieces, BUILT, APPLIED, PUSHED AND WALKED THROUGH

Objectives, the client's reply and the publish email, from the plan Nina and
Dom approved ([the plan](https://claude.ai/code/artifact/7e5a8f35-1801-4a1b-90c7-40321ca38a6b)).
Commits `b2ad046` and `8c1fcff`. **§8 is complete after this** — the plan
went through the section line by line and found nothing else hiding.

**Their four answers, which are now decisions:**

1. The publish email goes to **the client contact only** — the one login
   holding the client grant on that business. Not the assigned team member.
2. A client may reply **more than once** on a month: a dated thread, oldest
   first. They reword their own and never delete one.
3. Objectives are written by **Nina or an assigned team member**, as the
   database already allowed. The client sees nothing until publish.
4. Republishing **sends again, worded as an update** ("Your August report has
   been updated"), not as a new report.

**Deliberately out of scope:** unread-reply counts on the admin client list.
They need a second migration to record what Nina has read; she said leave it.

**The migration is applied, and verified three ways on live** rather than
taken from the CLI's word:

- the three columns are there with their comments, read over REST;
- `20261005120000` is recorded in the remote migration history;
- `pg_get_functiondef` on live returns the guard with all five columns in
  both branches, the service role still admitted, `security definer` and
  `set search_path = ''` intact — read through the Management API's query
  endpoint, which is the way to read live DDL from here. `supabase db dump`
  needs Docker, which this machine does not have.

`npm run db:push` from Claude's shell hung with no output and changed
nothing, as it has before. **Dom runs it; the verification above is the
part Claude does.**

**What is waiting:**

1. The walkthrough on localhost, as Nina and as the client — Dom, next.
2. The real send, **on the live site after the push**, not from localhost
   (Dom, 5 Oct). Copying the Resend key into `.env.local` was the
   alternative and was declined: `RESEND_API_KEY` is absent there, so
   localhost sends nothing at all, and `NEXT_PUBLIC_SITE_URL` is
   `http://localhost:3000`, which the publish email refuses by design.

**The one real bug this found, and it was live** (`b2ad046`): RLS hands an
admin every grant on every workspace, so `getReportUser().grants` was
everybody's. Every caller then did `grants.find(by workspace)` and read
`display_name` off whatever row came back — which on a retainer workspace
is the client's. **A note Nina wrote, under "Notes from your strategist",
was signed with the client's own name.** Routing was unaffected, because
`canEdit`, `canPublish` and `canWriteStrategistNote` all check `isAdmin`
first, which is why a walkthrough never showed it. Found by a test asserting
the signature on an objective — not by looking for it. One
`.eq("user_id", user.id)`.

**Three mutations went unnoticed on the first pass, and all three for the
same reason: the test had no tie to break.**

- Removing the `role = 'client'` filter on the recipient changed nothing,
  because the client's grant sorted first anyway. The test now publishes a
  workspace whose client login has been removed and a team member left in
  its place: nothing is sent, and the reason is recorded.
- Two reply rules were held by RLS rather than by the lines being mutated —
  true for the client, false for Nina, whose admin policy admits every row.
  The test now tries both as Nina.

**The publish email's link is its own module** (`src/lib/reporting/publish-link.ts`)
with its own tests, because it is the invitation bug again: a link built from
the request's origin works perfectly for whoever sent it and is dead for the
client. It takes the configured site address and nothing else, and refuses to
send when that is missing or local — saying so on the publish card, with the
month still published.

### A wrong call worth keeping: "the deploy is stalled"

For an hour on 5 October Claude reported that `c567b95` had not deployed and
that Vercel needed looking at. **It had deployed, within the usual minute.**
Dom checked the dashboard: `eb556e3` Ready and current in Production.

Both signals were worthless, each for its own reason:

- **The server-action id.** `/login` carries a 40-hex id for the `signIn`
  action. Claude sampled it *after* pushing — so if the deploy had already
  landed, the "before" value was already the new one and nothing could ever
  change. It then compared live against an id from a **local** `next build`,
  which is not comparable: the hash depends on build inputs, so two builds
  of the same source differ.
- **`last-modified` on a static chunk.** Vercel serves unchanged content
  from the previous build's blob, mtime and all, so it does not move when a
  deploy changes nothing in that file.

**Do not infer a deployment from content fingerprints.** Use the Vercel
dashboard, or a probe that exercises behaviour only the new code has — the
2 October check did exactly that, signing in as the client and asserting on
a sentence the old build could not produce, and it was right.

The second false negative the same day came from the same haste: a check for
the guard trigger used `pg_get_triggerdef(oid) like '%before insert or
update%'`, which is lowercase against DDL Postgres renders in capitals, and
reported `false` on a trigger that was perfectly correct. **A probe that
fails is a claim about the probe until it has been read.**

### 5 October — two fixes on review, pushed and live (`c567b95`)

Both came from Dom reading the overnight work rather than clicking it, and
both are the same lesson in different clothing: **a fix that is only
half-right looks exactly like one that is right.**

1. **The paging fix could still miscount** (`f67f28f`). `b4c9ce3` paged the
   admin client list, and paged correctly — but `report_workspaces` was
   ordered by `business_name`, `report_periods` by `month` and
   `report_access` by `workspace_id`, and none of those is unique. `.range()`
   paging is two separate queries, and Postgres is free to order tied rows
   differently in each, so a row can come back on both pages or on neither.
   The quietly-wrong count that paging was added to prevent, reintroduced by
   the fix for it. Every sort now ends in `id`.
2. **A sign-in sent a reporting client to a members-only page** (`c567b95`).
   On localhost Dom signed in as the Test Client login and landed on "Your
   account isn't ready yet" — the login URL still carried `?next=/no-access`
   from a tab left open while signed out. The proxy sets `next` to whatever
   page was requested, and the action honoured it as long as it was an
   internal path. **Internal is not the same as theirs to use.**
   `usableNextPath()` now judges a path against the door the login has:
   a reporting login keeps `/reporting` and its query string and loses
   everything else, `/no-access` and `/login` are refused for everybody,
   `/set-password` stays open because an invited account has no door yet.
   `/auth/confirm` shares the same resolver — it is the other door that
   completes a sign-in, and the last time those two disagreed about a
   destination was walkthrough bug 1.

**The harness needed teaching for the first one, and that is the part worth
keeping.** A tie test only bites if the database actually reorders tied
rows, and PGlite will not bother shuffling seven. So the shim now knows
`.range()`, and when a paged read's sort is not total — judged against the
table's own unique indexes, not a guessed column name — it does what
Postgres is permitted to do: tied rows break one way on one page and the
other way on the next. Without that the new test passed with every
tiebreaker removed, which is to say it tested nothing.

**A second-order version of the same trap, caught by mutation testing:**
the `report_access` case passed with its tiebreaker removed because one
client grant per workspace made `workspace_id` accidentally unique. The
test assigns two team logins to every workspace now. **A tie test with no
ties is a green light wired to nothing.**

Eleven mutations in total, all caught: three tiebreakers and eight on the
sign-in path, including "honour `next` unchecked", which is the original
bug. `supabase/tests/report-paging.test.mjs` and
`supabase/tests/sign-in-next.test.mjs`, both in `test:db`.

### Bugs found and fixed along the way, by shape

Worth knowing because the shapes recur:

- **A pulled metric with nothing behind it.** `financials_revenue_from_offers` is PULLED, and `report_values` refuses to store a pulled figure — so reading it as a typed field returned null forever and **Revenue and Profit showed a dash on a month with offers entered perfectly well.** There is now a `PULLED_COVERAGE` map checked against the seed both ways.
- **A cancelled member kept reporting access.** `report_can_view()` never consulted `has_portal_access()`. Fixed, scoped to `kind = 'aos_member'` and the client role so retainer and Chiarezza logins are untouched.
- **An append-only audit trail that wasn't.** `report_csv_imports` had a `for all` policy. Found by listing policies out of the database rather than reading the files — a technique worth repeating.
- **Three places deciding where a login goes.** The sign-in action still sent everyone to `/piazza`, so a retainer client's first sign-in landed on "Your account isn't ready yet". Now one tested function.
- **A rule copied four times.** Who may edit a workspace was written out in the page context and three actions. Now `src/lib/reporting/access.ts`, tested.
- **A form inside a form.** The offer setup form was nested inside the monthly figures form — invalid HTML, failing hydration — with a comment above it claiming it sat beside rather than inside. The Next dev overlay had been reporting it; nobody was reading the log.
- **An invitation link that only works on the sender's machine.** `NEXT_PUBLIC_SITE_URL` is localhost locally and invites build their link from the request origin, so a test invite works perfectly for whoever sent it and is dead for a client. All three invite paths now refuse. **Send invitations from the live site.**
- **A Chiarezza-only field on every kind of client**, which the action then refused to accept a value in — leaving a dead-end form. The field is conditional now and a stray value is ignored rather than fatal.
- **Paging with a sort that is not unique.** Every `.range()` sort must end
  in a unique key, or two pages can disagree about which tied row is whose.
  The count comes back wrong and the page renders perfectly.
- **A `?next=` that is internal but not theirs.** Validating a redirect
  target as "an internal path" is only half the question; the other half is
  whether this particular login can use it. Since 30 Sep not every login is
  a member, so the two halves stopped being the same question.

### What was verified, and how

- **Signed in as a retainer client in a real browser** (1 Oct) and read the HTML the server sent: zero `/admin` links, no `/admin/` anywhere in the source, no `?workspace=` parameter, no trace of a second client that genuinely existed at the time, and no "Enter data", "Save draft" or publish control. `/admin/reporting`, `/admin/members`, `/piazza`, `/you` and `/sociale` all redirect to `/no-access` — **refused, not hidden from the nav.** Their own business name *is* present, which is the positive control.
- **The whole month, through the real actions** (`supabase/tests/reporting-actions.test.mjs`, 13 assertions): create client, set up an offer, enter its month, enter four categories, write a note, publish, unpublish, second month — as Nina and as the client, with real RLS.
- **Rendered at 1440 and 390** and looked at.

### Two traps in the tooling, found the hard way

- **Chrome headless has a 500px floor on `--window-size`.** A "390px" screenshot is a cropped desktop render, which looked exactly like a horizontal-overflow bug and cost three wrong fixes before a numeric readout on the page showed `viewport 500`. Screenshot phones over the DevTools protocol with `Emulation.setDeviceMetricsOverride`.
- **The PGlite shim disagreed with production in four ways**, each making a correct thing look broken: no `.returns<T>()`; foreign keys for embeds guessed from the table name (`report_workspaces` → `report_workspace_id`, when the column is `workspace_id`); `upsert` with no explicit target treated as a plain insert when PostgREST resolves it on the primary key; and — the worst of them — **`numeric` returned as a string where PostgREST sends a JSON number**. The formula module tests `typeof value === "number"`, so every money figure, rate and hourly cost silently became a dash in tests while working live. It made a correct fix look unfixed for half an hour. All four fixed in the shim, and the numeric case is normalised in `ValueBag` as well, because a string arriving in production would fail the same silent way. **When a test disagrees with live, suspect the harness as readily as the code.**

## STEP 13 FLOURISHES + THE LOG'S WEEK NAVIGATION — BUILT 30 Sep, PUSHED 30 Sep

Commits `f3a9497` and `8f55ebc`. No migration. Pushed 30 Sep with the reporting work. Verified: tsc, lint, build; 247 unit / 289 schema / 169 action; every screen rendered, including two caught mid-animation.

**Week navigation on the log (Dom's ask).** `?week=` picks the Monday. The current week is the only one that can be changed — a past week loses the timer tab, the manual-entry button, delete, note editing and the sign-off form, **removed rather than disabled**, and a week that closed unsigned says so rather than offering to sign it late. Boundaries are a pure tested module (`lib/log/weeks.ts`): a future week and a week before they joined both fall back to the current one. **Day links carry the week** — without that, tapping a day in September threw you back to this week, which the rendered HTML caught rather than the types.

**Three flourishes from Step 13, all CSS, all droppable** — remove the class and the thing underneath still reads. Each runs once on arrival, and all three are stilled under `prefers-reduced-motion`, following the map dot's pulse.
- **FATTO stamp** on a signed-off week, pressed on crooked, hidden from screen readers since the card beside it already says the week is signed.
- **Flip-board counters** on the three hours-reclaimed numbers (Piazza's strip, Piazza's card, the milestones headline). Server-rendered, no count-up loop; the whole value is in the DOM for a screen reader with the characters hidden, so it is announced as "7.5" rather than digit by digit. Only the hours flip — the other two stats change by one and would look fussy.
- **Self-drawing map lines**: each spoke inks itself from the fountain outwards, its dash set to its own length because one number leaves short spokes finished early and long ones cut.

**The Vespa intro video is skipped** — no asset yet (Dom). The rest of Step 13 is done.

**Found while rendering:** the Piazza prize card reads "test." for September, because that month's `draws` row has the literal prize "test" from earlier testing. The fallback copy only applies when no draw row exists. Nina should set the real prize on the row in `/admin/draw`, or delete it.

## ROUND 6 — check-in nudge, inactivity nudge, the prize bar, Sociale — ALL FOUR BUILT and PUSHED 28 Sep; both migrations applied

Brief: `docs/aOS_Round6_Checkin_Prize_Chat_Brief.md`. Commits `60e0db6`..`fa63506`; migrations `20260928120000` and `20260928130000` applied (table, function and enum value all confirmed live afterwards). **`npm run db:push` hung twice from a non-interactive shell** — stalling straight after failing to read `~/.supabase/profile`, printing nothing, exiting 0 having done nothing, while Postgres answered on its own port in 86ms and REST returned 200. Dom ran it in his own terminal and it went through. Worth remembering: that command may now need a real TTY. Verified: tsc, lint, build; 238 unit / 289 schema / 167 action; mutation checks on every new rule.

### §1 Friday check-in nudge — BUILT as a merge (Dom, 28 Sep)
The brief reads "check-in" as the Weekly Check-Ins room and suggests copy telling members to "pop your update into Sociale before then". **That room is write-locked outside Mondays 2–3:30pm** (`chat_channel_open` in the insert policy, plus the friendly refusal in `sendMessage`), so the email would send members somewhere that refuses them. And "check-in" already means the Friday weekly-log sign-off everywhere else in the product — `countCheckInsThisMonth` says so in a comment, and the Piazza stat labelled "check-ins this month" counts submissions. **Read as a Friday nudge to sign off the log**, which is also the only reading a member can act on the day it arrives. Second problem either way: `log_reminder_endweek` already goes out on Fridays to anyone under ten hours, so an unconditional second one means two emails on one morning, against this codebase's own line on reminder noise. Recommended: one Friday message leading with the check-in, adding the hours line only when they are short. **Dom chose the merge:** one Friday email, check-in first, the hours paragraph folded in only when it is true, and no second Friday email alongside it. So `shouldSendReminder` now always returns true for Friday (the gate moved into the copy as `isShortOfCompleteWeek`), the subject is "Sign off your week before Monday", and the body names Monday's Q&A without asking anyone to post in a room that is shut until it opens. Audience unchanged — onboarding and active, as the Friday email already reached. Both faces are tested through the handler, and both mutations fail: forcing the hours paragraph on, and restoring the old under-ten-hours gate.

### §2 Roadmap inactivity nudge
Nothing recorded when a member last *read* their roadmap, so `roadmap_seen` does (one row per member, written only through `record_roadmap_seen()` so it cannot be backdated to duck the nudge). "Interacted" is the latest of three marks — opening it, ticking an action, writing a month note — because somebody who spent Tuesday ticking things off has not been away. Queued by the daily cron for members with a **published** roadmap only, re-sent weekly while they stay away (the dedupe key carries the week), and re-checked at send time, since planning is 08:00 and a member who opens La Strada before the send should not be told they have been gone. Copy is Nina's, including the second sentence that offers the way out.

**It has fired for real.** 30 September, 08:58: one `roadmap_idle` job, to Dominic's test account, status `done` — the nudge works end to end in production. Note what it could not know: `roadmap_seen` only started recording on 28 September, so at that moment "never opened it" and "opened it before we started recording" were the same thing, and every member with a published roadmap looked idle. That only mattered at rollout, and rollout has now passed with no real members — from here, no row genuinely means they have not been in. **If the table is ever introduced under a live cohort again, the first week of nudges would be wrong**, and that is the moment to add a grace window rather than now.

### §3 The prize bar — a contradiction, not just a wiring job
`draw_eligibility` required a ten-hour week in **every** Monday-week of the month. The log's card and both reminder emails have always said **one** week. So the product promised a bar four to five times easier than the one it applied, and wiring Piazza to the copy alone would have made the promise louder while the draw kept refusing people. The function now takes one complete week (`20260928120000`), and Piazza carries the prize and the member's standing, reading the same database function the draw runs on. Four existing tests changed meaning and now assert intent — entries by who is in rather than how many, the winner by coming from the entrant list (with two entrants, that finally distinguishes a real draw from a function returning its only row), plus a new fixture member who logs nine hours so the bar still excludes somebody.

### §4 Sociale
La Strada's hero photograph reused as the wallpaper — it is the Amalfi coastline the brief asks for, already brand-approved, already carrying the aOS mark on the sail — at 8% with the colour pulled out, fixed behind the scrolling thread. A run of messages from one sender is drawn once: face and name at the top, tail on the last bubble, tighter spacing between; five minutes ends a run as well as a change of sender (pure, tested). Own messages move to the brand navy. **Two things the render caught that the code did not:** a pale bubble over the wallpaper stopped reading as a bubble at 390px, so received bubbles gained a hairline; and the avatar, hung off the last bubble as a messaging app would, landed beside the timestamp and reaction row rather than beside anything it named — so the face sits at the top of a run instead. Six seeded messages used for the render were removed from the live room afterwards.

## THE EMAIL THAT WASN'T BROKEN — 28 Sep, committed and PUSHED

**Nothing was wrong with the key or the code. The send was running somewhere without it, and the email has since been received end to end on production (Dom, 28 Sep).**

**The corrected scoping, checked by Dom in Vercel: only `SUPABASE_SERVICE_ROLE_KEY` was scoped to Preview.** Both `NEXT_PUBLIC_SUPABASE_*` were already Production-only — which does not fit a plain "it was a preview" story, because those two are inlined at build time, so a preview built without them has no database client at all and would have died long before the email. **The one explanation that fits every fact is an *older* preview deployment**, built while the public keys were still preview-scoped and carrying those inlined values, with the service-role key live at runtime and `RESEND_API_KEY` never in its snapshot — a deployment keeps the environment it was built with. **This is the best-fitting explanation, not a proven one:** the fingerprint that would have named the deployment shipped after the retry, the recap row now reads `email_sent_at` with `email_error` null, and the home-screen icon has been deleted and re-added from the real domain. It cannot be reconstructed, and it does not need to be — the conditions that allowed it are closed.

**How a preview got opened without anyone noticing:** a web manifest's `start_url` is relative, so an installed home-screen app is pinned to whatever origin it was added from — and the app was removed and re-added twice on 20 Sep during the push-notification work. A standalone window has no address bar. The same shape as the viewport bug: the device was telling the truth and nothing was showing it.

**Both fixes, on Dom's call:**
- **A red banner on every screen of any deployment that isn't production**, server-rendered from `VERCEL_ENV`, in the document flow rather than fixed (a second fixed element after the four-attempt viewport saga was not worth it). Local dev stays quiet — the address bar already says localhost. Rules are pure and unit-tested in `lib/deployment.ts`; verified by running the production build twice, once with `VERCEL_ENV=preview` (banner) and once with `production` (none), and measured at 390px for horizontal overflow: none.
- **Previews keep no Supabase keys at all** (Dom: "we don't test on preview links, so previews don't need a working database"). `src/proxy.ts` now answers every request on a deployed-but-unconfigured build with a plain 503 naming the deployment and pointing at the live domain, instead of a stack trace from the first query. Verified by building with the keys stripped from `.env.local` and serving it: `/`, `/piazza` and `/manifest.webmanifest` all 503 with the message; `.env.local` restored and checksum-matched afterwards.

**Done in Vercel by Dom, 28 Sep:** `SUPABASE_SERVICE_ROLE_KEY` unscoped from Preview (the other two already were). **The `envFingerprint` diagnostic has been removed** now it has served its purpose; the "Email sending" readiness row on `/admin/members` stays, without the environment dump. Banner, keyless refusal and the received email all verified by Dom.

## RECAP — FIRST REAL SEND, AND THE TWO FAULTS IT FOUND — 23 Sep, PUSHED; migration applied

Dom sent Dominic's September recap on live. The archive on You was right; two things were not.

**1. The Piazza card wouldn't go, because the read was never recorded.** Reproduced locally against the live database in one run, with the actual error rather than a theory: `Route /reviews/[month] used cookies() inside after() while rendering. This is not supported.` The read page marked itself read inside `after()`, and building a Supabase client there reads cookies, so the callback threw, `opened_at` stayed null and the card stayed. **The harness could not have caught it:** it stubs `after()` to run inline and stubs the client, so neither of Next's rules exists in the test. Fixed by awaiting the mark inline — one guarded, idempotent UPDATE on a page a member opens once a month, which beats a deferral that can fail silently. Verified against live: `opened_at` set, Piazza card gone, no `after()` error in the log.

**2. No email arrived, and nothing in the product could say why.** The send runs in `after()` from the action, so a failure has nowhere to surface; the only record was a Vercel log line, and the CLI needs an interactive login. That is a silent failure in something Nina uses unattended. Now `monthly_recaps.email_sent_at` / `email_error` (`20260923140000`) record every exit — including "member cancelled" and "couldn't read the member", which otherwise look identical to a working send from outside — and the admin screen shows it with a **"Send the email again"** button. Sending stays once-only; the email is separately retryable, because the alternative retry is a second recap for the same month, which the unique index refuses. **Whether the first email ever reached Resend is still unknown and now unknowable** — that send predates the recording. The retry is how we find out.

Both new columns joined the guard's blocklist in the same migration. Mutation checks: removing the error recording fails the retry test; removing either column from the guard fails its own test — and the guard test had to be fixed first, because clearing a null changes nothing, so it passed against a guard that didn't name the column at all.

## SEPTEMBER TEST DATA + THE BUILD GUARD — 23 Sep, PUSHED; guard migration applied

**Seeded on Dominic's account (approved line by line first), so the recap has something real to compile:** nine September time entries (13h 30m — Client Sessions 5h, Ads/Marketing 2h, Course/Client Admin 2h, Sales calls 2h, Finance admin 1h 30m, Other admin 1h); weeks of 7 and 14 Sep signed off, each with a written Friday reflection; the 14 Sep log's ticks reset from five junk test actions to the two real ones; "Set up client onboarding process" and "Review Current Pricing Structure" ticked on La Strada; the `test`/`test 2` ticks turned off; September's confirmed hot seat challenge rewritten from the literal string "test". Hours reclaimed accrued through `accrue_hours_for_week` rather than hand-written ledger rows: 7.5 for September. **Milestones deliberately left reading "None this month"** — the line needs 50 banked hours and fabricating them would put invented history in a real table (Dom).

**The build is still unconfirmed, by choice.** `guard_handover_pack_member_update` refused the service role, so the seed couldn't confirm or rename it; Dom will try the `/admin/hot-seat` confirm flow, and if that doesn't populate `handover_pack`, the block reads "No build confirmed this month", which is honest. **He declined the offer to finish it with a session on his own admin account** — more access than the task needed when every other write went through the UI, the service role or a test account. Recorded as a standing preference.

**Guard fix (`20260923110000`, not applied):** the second guard admitting only `is_portal_admin()`. Nothing writes `handover_pack` with the service role today, so this closes a latent trap rather than a live fault; the member-side blocklist is byte-identical and its existing tests still pass, with one new case for the service role (removing the clause fails it). **Audit result: two other guards share the shape** — `guard_roadmap_note_member_update` and `protect_member_admin_fields` (members: role, status, lifecycle). Neither is written by the system today. Left alone deliberately: the members one is the guard whose blocklist is most worth keeping strict, and the right moment to loosen either is when something actually needs to write them.

## MONTHLY RECAP — the app collates, Nina writes, the member reads — BUILT and PUSHED 23 Sep; all four migrations applied; verified end to end on live 28 Sep

Brief: `docs/aOS_Monthly_Recap_Brief.md`. The third feature on the rule-2 pattern, after the roadmap and the reveal: aOS assembles a month of real data, Nina drafts the writing with Claude **outside** the product, the finished text is pasted back in. Nothing here calls an AI. Migration `20260923100000_monthly_recaps.sql` (**not yet applied**). Verified: tsc, lint, build; 227 unit / 284 schema / 153 action; mutation checks on the compiler (two), the guard trigger (two, run separately after the first pair masked each other), and both send guards; the member card, the read page and the admin screen rendered with the real components and built CSS.

### Dom's two answers (the brief's open questions)
- **A real read timestamp**, not "sent is read". `opened_at` is set when the member opens the recap, the same shape as chat's read tracking. It is what takes the card off Piazza and what tells Nina it landed — the admin screen shows "Read Tue 6 Oct" or "Sent …, unread".
- **Copy: Nina's confirmed wording is in, 23 Sep.** Every member-facing string still lives in `src/lib/recap/copy.ts` and nothing composes its own sentence. It arrived written for one member's September, so the month, the name and the figures are interpolated rather than fixed. **Two lines of it are deliberately not shipped** — see below.

### The figures, and the two lines that couldn't be templated
The card and email quote "13.5 hours tracked & 7.5 hours reclaimed". Those come from `monthly_recaps.stats`, a jsonb snapshot frozen at send (`20260923120000`), not recomputed where shown: they have to agree with the writing they announce, and a month's numbers still move afterwards (an hour logged late, a rate backdated). A test logs eight more hours for a sent month and asserts the card still reads what Nina sent.

- **"Two roadmap actions are properly done too"** — templated (`One roadmap action is…` at one, dropped entirely at zero).
- **The opening figures line is dropped when both numbers are zero**, rather than opening with "0 hours tracked this month & 0 hours reclaimed for good".
- **"One enquiry nearly slipped through again & this time, it didn't"** — NOT shipped. It comes from that member's own Friday reflection; there is no honest way to template it, and hard-coding it would put a sentence about one person's month in everyone else's inbox.
- **"September's actually quite good, [name]"** and the enquiry sentence are now **"Your line"** (`monthly_recaps.personal_line`, `20260923130000`): one field on the admin form, Nina's sentence per recap, used verbatim as the email's subject and as its opening line under the greeting. Refused over 120 characters — it is a subject line, and half of her sentence is worse than being asked for a shorter one. Left blank, the subject falls back to "Your September review, [name]", which states rather than judges. The email opens "Dominic," again (the greeting was an oversight in the draft, not a decision), and the page intro is closed with a full stop.
- **Every new column is on the guard.** `personal_line` and `stats` were both added to `guard_monthly_recap_member_update` in the same migration that created them: the update policy lets a member touch their own sent recap to mark it read, so a column the guard doesn't name is a column they can rewrite. Both have a schema test, and removing either from the blocklist fails its own test.

### Built
- `monthly_recaps` — one row per member per month, `body` nullable (pasted over more than one sitting, as the reveal allows). Three states: draft (member cannot read it at all, enforced in RLS by `sent_at is not null`), sent, opened. Guard trigger: a member may set `opened_at` and nothing else — and it admits the service role (`auth.uid() is null`), the day-7 lesson applied at the time of writing rather than after.
- **The compiler** (`lib/recap/compile.ts`, pure and unit-tested) turns a month into one block to copy: time tracked and by category, weeks signed off, hours reclaimed this month and in total, milestones crossed with the week, roadmap actions completed, the build confirmed and its weekly rate, that month's confirmed hot seat challenge, and the private Friday reflections. **Zeroes are stated, never omitted** — a missing section invites a draft that claims something that didn't happen — and nothing in it interprets the month (a test asserts the absence of "great", "well done", …).
- **The collator** (`lib/admin/recap-source.ts`) decides "in the month" per source and says why: entries by when the work happened, ledger and reflections by the week they belong to, sign-offs by `submitted_at` (matching the Piazza stat), actions and builds by when they were marked. An action later unticked on La Strada is removed again rather than claimed.
- **Admin `/admin/recap`**: month chips (defaulting to the month that just ended), the member list with a Sent badge, the block with one Copy button, the paste form, the send button, and the read state afterwards. **Two steps, deliberately**: saving never reaches the member, sending is what emails and shows the card, and a sent recap can't be rewritten (a correction is a message from Nina, not a silent edit to something already read).
- **Member**: the navy card on Piazza while unread (`components/recap/recap-card.tsx`), `/reviews/[month]` to read it — which marks it read in `after()`, once — and a **Monthly reviews** section on You listing every one, newest first, read or not. Email goes from `after()` on send, like the pairing overlap, not the 08:00 cron; it names the month and links, and deliberately does not quote the recap into an inbox.

### Judgement calls, flagged
- **The archive lists every sent recap, not only opened ones.** The brief's "moves to" is the journey from Piazza; hiding a sent recap from its own archive until it had been opened would leave a member who tapped nothing with nowhere to find it.
- **No push.** The brief asks for email and a card. Push exists and is one line away if Nina wants it.
- **No notification switch.** The three that exist cover recurring machinery; a once-a-month piece of writing from Nina about them personally isn't that. Revisit if a member asks.
- **Privacy, stated rather than assumed (rule 6).** The reflections stay single-recipient — the member's own recap — which is what the brief settles. What the brief doesn't say out loud: **the block leaves aOS when Nina pastes it into Claude.** The compiled text carries its own "for Nina alone, never a shared room" label so it travels with the paste, and the admin screen says the same above the block. That is Nina's call to make knowingly, exactly as it already is for the roadmap.

## SOCIALE — the room fills the screen; only the thread scrolls — BUILT and PUSHED 20 Sep; confirmed on the phone after three attempts (see the viewport note)

Dom, 20 Sep: the compose box needed a page scroll to reach, on phone and laptop alike (same DOM, both affected — the layout is `min-h-full`, so every screen grows with its content and the document scrolls, which is right everywhere except a chat). Now, like a messaging app: chips, title and composer stay put; the thread scrolls in its own box and opens at the newest message, following new ones in only if the reader was already at the bottom (`thread-scroll.tsx`).

**Regression on the phone (Dom, same night): the bottom bar lifted off the bottom — in the installed app only; a Safari tab was fine.** Took four cuts; the first three were theories (overflow:hidden on the root; `dvh`; percent of the root) and each was wrong. The fourth came from **measuring on the phone** with a temporary readout (deleted since; it printed `innerHeight`, the viewport units, the safe-area insets and the bar's rect, opened from a dot in the corner because an installed app opens at `start_url` and has no address bar). What it showed, on an 874pt screen with a 62pt status band: **in a standalone iOS web app the root element is always the small viewport (812), and iOS anchors a fixed bar to the large viewport (874) only while the document is taller than the screen.** A shell sized to the root made the document exactly 812, iOS took that as the viewport, and the bar rose 62pt. Piazza, which scrolls, had the bar at 778→874 all along. Fix: `height: 100lvh` on the shell under `@media (display-mode: standalone)` — the large viewport, where the bar is on every other screen — and percent of the root in a browser tab, where that measures right (676 all round) and `lvh` would hide the composer behind the toolbar. **Confirmed by Dom in the installed app.** Lesson kept in memory: when a phone disagrees with every render, put numbers on the phone before the next theory. The bar sits where every other screen has it; the composer is flush on the bar (content padding = bar height + home-indicator inset, room padding 0); and the timer pill moves top-right into the header band in a room, since it would otherwise float over the Send row. How, without touching other screens: the room's `<main data-chat-screen>` is what `globals.css` keys on (`html:has(...)`) to size the shell and let its flex chain shrink (`portal-shell` / `portal-row` / `portal-content` hooks in the layout, `min-h-0` down to the thread). Bottom padding in that mode clears the floating timer as well as the bar. Verified on the production build with the real session (magic link into localhost, Chrome driven over CDP): phone 390×844 and laptop 1280×800 both have document height = viewport, composer on screen, thread at the bottom; Piazza still scrolls as a page (2034px document). iOS keyboard behaviour on the pinned document is the thing to watch on the phone.

## 20 Sep EVENING — pairing verified end to end on live; three things found on the way — PUSHED

**Verified by Dom on two accounts (dom Gmail ↔ Dominic Yahoo, this month's test pairing):** save → the overlap check fires within a second (`overlap_checked_at` 20:48:02) → push on Dominic's phone, email to both, and the "both free at 7pm on Monday 21 September" sentence on the pairing card and Piazza. Every link of the chain was checked separately before it passed as a whole — the first two runs "failed" for reasons that were each real and each unrelated to the check:

1. **The phone had no live push subscription.** The only row was from 14 Sep; removing and re-adding the home-screen app for the new icon discards the registration, and Apple keeps answering 201 for the dead one. Chat push was equally dead. Fixed by re-subscribing from You once the app was properly installed.
2. **The app was opening in Safari, not standalone** — where iOS has no push APIs at all, so You said "This browser can't show notifications". Two bugs of ours behind that: (a) the toggle checked API support *before* "iPhone but not installed", so it gave the wrong message; (b) **`/manifest.webmanifest` and `/sw.js` were behind the login redirect** (proxy, unchanged since 15 Aug). Safari fetches the manifest with no cookies, so iOS never saw it and decided "Add to Home Screen" from the meta tags alone, and the service-worker update fetch could get the login page back. Both are public now (`DEVICE_PATHS` in `proxy.ts`), and Apple's own `apple-mobile-web-app-capable` goes out alongside the standard tag. Verified on the production build locally: both 200 anonymously, pages still redirect.
3. **"No card update" was a stale client view.** Fetched live as the test account (magic link through `/auth/confirm`): the server had the sentence on both pages all along; reopening the PWA showed it.

Also: **a tick flickered off after Save.** React 19 resets a form's DOM when its action completes, and a controlled checkbox shows unchecked until the next render. The form is now keyed on `submitted_at`, so every save remounts it from the fresh server props. Saves were never wrong — the rows proved that — it only looked as if they were.

**Email:** Resend accepted the two pairing emails from `after()` on Vercel and both arrived. The cron's Friday reminders were the control (all `done`).

**Diagnostic method worth keeping:** read the rows (`due_jobs`, `pairings`, `pairing_availability`, `push_subscriptions`) with the service role before theorising; send a push straight to the stored subscription from the laptop to split app from device; fetch the live page as the member via a one-time magic link to split server from client. The Vercel CLI needs an interactive login, so function logs weren't available.

## ADMIN — getting a locked-out member back in — BUILT and PUSHED 20 Sep

Dom, 20 Sep: a test account's password was lost mid-testing, and "this is exactly the kind of thing that'll come up again with real members". No migration. Verified: tsc, lint, build; 7 new action tests (140 action total); mutation check on the admin refusal; the card rendered with a password showing.

- **An "Access" card on the member's admin page** (`lib/admin/access-actions.ts`, `admin/members/[id]/access-actions.tsx`), two buttons:
  - **Send a reset link** — the same recovery email `/forgot-password` sends, to the member's address, landing on `/auth/confirm?next=/set-password`. Nothing to hand over.
  - **Set a temporary password** — written onto the auth user with the service role (`auth.admin.updateUserById`, **with `email_confirm: true`** — see below) and shown once, large and copyable, for Nina to pass on. Twelve characters from an alphabet with no 0/O/1/l/I, so it survives being read over the phone. For a dead inbox, a link that never lands, or a test account.
- **Refused for admin accounts** (setting another admin's password is taking their account; the two admins use `/forgot-password`) **and for cancelled members** (nothing to restore). The card isn't shown for either, and the actions refuse regardless of the page.
- **"Change your password" row on You** → `/set-password`, which already takes any signed-in session; it's where a temporary password gets replaced. Nothing forces the change — Supabase has no must-change flag; noted, not built.
- Harness: the shim now records `auth.resetPasswordForEmail` and `auth.admin.updateUserById` (`authCalls()`), and `next/headers` is stubbed. The one-off `scripts/dev-set-password.mjs` used for the unblock is deleted now the feature exists.
- **Found on first use (Dom, 20 Sep): the password set but sign-in said "hasn't been activated yet".** That is our wording for Supabase's `Email not confirmed`: the two Gmail test accounts (`yungsl5dom@`, `nina.ellen.oliver@`) were invited on 3 Sep and the link was never opened, so `email_confirmed_at` is null, and Supabase refuses password sign-in for an unconfirmed email whatever password is set. The temporary-password action now passes `email_confirm: true` — this route exists for exactly the member whose email doesn't work. The reset-link route is unchanged; the link confirms as part of verifying. `yungsl5dom@` was confirmed by hand the same day to unblock testing.

## PEER PAIRING — real dates and times, overlap told on the second pick — BUILT and PUSHED 20 Sep; both migrations applied live

Commits `23ce953`, `05fda70`; `20260921090000` and `20260921100000` applied via `db:push` on 20 Sep, `migration list --linked` matches. Dom's decision: the two September test pairings stay unflagged. Brief: `docs/aOS_Peer_Pairing_Date_Availability_Brief.md`. A deliberate reversal of tested behaviour, treated like the ledger change: the weekday × part-of-day grid ("tue-pm") is gone, not kept alongside. Migration `20260921100000_pairing_date_slots.sql`. Verified: tsc, lint, build; 209 unit / 274 schema / 133 action; mutation checks on the once-only guard (removing it fails two tests) and on the service-role guard (below); the form rendered at 350px and 640px with the built CSS.

### The mechanic as built
- **A slot is one hour on one date**, UK wall clock, id `2026-10-06T14:00`. Weekdays only, 9am–8pm start times (Dom, 20 Sep — was 9–6 as built), from today onward. Stored in the same `pairing_availability.availability.slots` array — only the vocabulary changed, so `pairing_shared_slots()` needed no change. Anything not of that shape is dropped on read and on save.
- **Order is match first, pick after.** The brief's trigger is "the second partner *in a pairing* submits", which means the pairing exists before the picks. So: Nina matches by rotation → the booked-in email says who and sends them to pick → each picks → the second pick fires the overlap check. **The matcher no longer reads availability at all** (it was only a tie-breaker; under the new order the data mostly doesn't exist when it runs, and consulting it would reward whoever picked early). Anyone who picks *before* the match still counts: matching runs the same check on each new pairing, so a pair who had both picked hear where they overlap then.
- **The check** (`lib/pairing/overlap.ts`, service role): nothing until both have a `submitted_at`; then `pairings.overlap_checked_at` is claimed with an update conditioned on null, and only the caller whose update landed sends. Once per pairing — a resubmit changes the picks (the card reads them live) but sends nothing again. Sitting the month out (zero picks) counts as a pick, so the partner isn't left waiting.
- **Channel.** The existing pairing-booked message is **email only, via the daily `due_jobs` cron, on the member's "Pairing" switch**. "Immediately" rules out the queue, so the overlap message goes from `after()` in the action: the email (same words, same switch, logged not retried if Resend fails) **and a push to every device regardless of the chat switches**, like Nina's hot seat note. The same sentence is on the pairing card and the Piazza card the moment the check has run, so nobody depends on delivery. Nina's two sentences are used verbatim; with more than one shared time the earliest is named and the rest counted.
- **Form**: one folding row per remaining weekday, twelve hour chips each, days with picks open by default, a running count. Real checkboxes inside `<details>`, so it submits without JavaScript.
- **Admin page**: matching no longer waits on anything; each pair shows "Waiting on X to pick dates" / "Both free 2pm Tue 6 Oct and 1 more (both told)" / "Both picked, no time in common". Booked badge added.
- **Legacy rows**: the migration strips old-grid keys; for the current month onward it clears `submitted_at` so the member is asked again; past months keep their (now empty) row as a record they answered. Checked on seeded rows in PGlite (past: stripped, still submitted; current: stripped, asked again; new-shape row untouched).

### Judgement calls — all confirmed by Dom, 20 Sep
- Weekdays only, 9am–8pm start times on the hour (extended from 9–6 on Dom's instruction). Both one constant away (`SLOT_HOURS`, `weekdaysInMonth`).
- The check fires once. If a "no overlap" pair later add a matching slot, the card updates but no second message goes.
- The coach pairing goes through the same flow: Nina picks her dates on `/pairing` like anyone else.
- **Held for later (Dom):** tying the pairing window to the hot seat schedule — waits on the full hot seat schedule.

### Found on the way — a real production bug, fixed here
**The day-7 flag has never been set live.** `guard_pairing_member_update` (3 Sep) lets an update through only for `is_portal_admin()`; the cron writes `flagged_at` with the service role, which has no JWT, so `auth.uid()` is null and the trigger refused it. The runner didn't check the update's error, so Nina's stalled-pairing email went, the job was marked done, and the flag she'd look for on the admin page was never set. **The test passed because the PGlite shim ran service-role queries with no session changes, inheriting whichever uid the previous member (or admin) query had left in the session.** Fixed three ways: the guard now admits `auth.uid() is null` (the `accrue_hours_for_week` convention); the runner throws on a failed flag write, so the job fails visibly and retries; and every shim query now runs in its own transaction with `set local role` and a local claim, so a service-role query sees no uid and a pending `after()` job can't interleave with the next test's member session. Three existing tests had been leaning on the leak (two coach-constraint checks with no session, one fixture update) and now say who they run as.

**Checked on live, 20 Sep (read-only, service role).** Two September pairings, both created 3 Sep 21:57; both day-7 jobs ran at 22:06 and are `done` (Nina was emailed); **`flagged_at` is null on both**, and pairing `9416ff70`'s `updated_at` is still its creation time — the flag write never landed. The hand retest that evening then shows the symptom being read as a pass: `retest` (22:13) skipped because `met_at` was set; `met_at` was cleared by hand at 22:15:04 and `retest2` (22:16) sent — which it could only do because the 22:06 flag hadn't stuck. So the doc's "sent and set the flag" from 3 Sep was half right: it sent. **No organic duplicate has gone out** — the cron queues one job per pairing on a fixed dedupe key, so the only double email about a pairing was the deliberate retest. The two September test pairings still show unflagged; setting `flagged_at` on them by hand is Dom's call (they were emailed about at 22:06).

**Also corrected in "Verified live, by hand" above:** the day-7 line there is now marked as disproved.

## THE MAP — third artwork, every station its own building — BUILT 19 Sep, PUSHED 20 Sep; both pictures signed off by Dom

New `the-map-landscape` (1672×941) and `the-map-portrait` (1086×1448), shipped as JPEG at 85 (~540KB each). No migration.

**Landscape positions: signed off by Dom on 19 Sep** after nine rounds of screenshot-driven nudges (labels beside buildings rather than across them, dots on doors, roofs and steps; `labelLeft` for Piazza Caffè, Banco, Club Allegro, Archivio). **Portrait positions: signed off by Dom on 20 Sep** after one round from a phone screenshot (Stazione on the roof with the label right, Archivio under its door with the label left, Banco on the roof with the label left, Studio higher; the hotel a little lower to clear Stazione's label). Nothing open on The Map.

**Dev gotcha, worth knowing:** replacing an image at the same filename leaves Next's optimiser cache (`.next/dev/cache/images`, 4-hour entries) serving the old picture through a hard refresh and a server restart. `rm -rf .next/dev/cache/images`. Live is unaffected: each deploy starts empty.

### What's different about this pair
The artwork paints every station as a named building: BANCO is the temple, CINEMA has the marquee, the blue awning says GRAND HOTEL RIPOSO, and so on; Piazza Caffè is the striped umbrellas, La Boutique the coloured shopfronts. So each dot sits on its building on each picture, and placement stopped being a judgement. Everything else was rebuilt as before: masks regenerated with each picture's SHA guard, spokes from each picture's fountain, mask and geometry tests run for both, rendered with the real component at 350px and 960px.

### Decided with Dom before building
- **Your Story is now a plain pair of spokes** (hotel and Archivio, in navy). On this picture both sit on the left above the harbour and the dashed shore route had nowhere to run. The route code, bends, bend dots and the "Your Story Stations" legend entry are gone.

### Found and fixed on the way
- **The mask generator seeded the flood fill from the hotel's navy awning**, which touches the portrait's left edge and is the sea's colour (RGB 57/105/151 vs 50/120/154). The fill now seeds only from runs of three or more candidate cells along the border: the sea meets the edge in stretches, an awning in one cell. Both masks read right afterwards.
- **Five label collisions** caught by the overlap test (Banco/Studio on both pictures, Terrazza/Officina, Club/La Boutique, hotel/Officina): dots slid within their buildings. La Boutique's label goes left on the portrait by an explicit per-station override (`labelLeft`), a hand rule beside the geometric one, since the right would fit but meets Terrazza's.
- **The place labels are off on the portrait** (`placeLabels: false`). At 350px the square is a hundred-pixel patch under six pills and "Piazza. Home" / "Piazza Sociale" landed on one wherever they went; both are a tap away in the bottom bar. The landscape keeps them, with Piazza Caffè's label flipped away from the hub's. The overlap test now includes them where drawn.

## BRAND — the real logo — 20 Sep, confirmed by Dom and PUSHED

Dom's final files in `public/brand/`: the lemon-O "aOS" mark, blush on orange for the icons (`icon-192`, `icon-512`, `apple-touch-icon`, `favicon.ico`, plus `aos-icon-master.svg` as the source), and `aos-header-logo.png`, the orange letterforms on transparent, for the header. The icon files keep their names, so the manifest and the layout's `icons` metadata needed no change. The favicon Next serves is `src/app/favicon.ico` (copied from the brand folder; RGBA PNG-in-ICO, which Turbopack accepts). The header shows `aos-header.png`: the master trimmed to its letterforms (they sit in a 793×378 box on a 1000×1000 canvas, which at header height would be a 10px logo) and resized to 600px wide, twice its largest display. The two traced/extracted SVGs from before are gone. Theme colour stays navy.

## THE MAP — dots and cards instead of tiles — BUILT and PUSHED 19 Sep; confirmed by Dom

Brief: `docs/aOS_TheMap_Dots_Brief.md`; reference: `docs/allegro-final-map.html`. Commit `68e722b`. No migration. Pictures, positions, lines and mask tests untouched in kind; four positions nudged (below). Verified: tsc, lint, build; 220 unit (55 map); rendered with the real component and built CSS at 350px and 960px with a card forced open.

### Built
- `station-dot.tsx`: a 14px gold dot with a 6px halo and the reference's pulse (0.7→2.1 scale, 2.4s, pure CSS, stilled under reduced motion); a pill label with the reference's numbers (11px, 0.12em tracking, 13px padding, 62% dark, white hairline); a card (230px, the reference's colours and type) with the station's photo, a kicker ("03 · Systems & Delivery"), the name in italic serif, the description cut to one line at a word past 80 characters, and the link.
- Interaction as the brief has it, not as the reference's script has it: hover opens the card (CSS, so keyboard focus opens it too), click goes to the station; on touch, tap opens, tap again / tap away / Escape closes, the card carries the link. Locked (onboarding) members get the dot and card with "Opens when you're active" and no link.
- Labels flip to the left of their dot when the right would run off the picture; decided by geometry at the narrowest real width (375px phone, 768px tablet), in `lib/map/markers`. The portrait's pill is one size smaller (9.5px): at 11px "Studio dell'Architetto" and "Stazione Centrale" fit on neither side of their dot on a phone. **A 320px phone is no longer a supported case** for label fit; nothing sold today is 320.
- Tests: fit at four widths; a new overlap test on the real dot-and-pill rectangles, which caught Studio/Cinema and Officina/Piazza Caffè meeting on the portrait (Cinema and Officina moved down a row); the mask "mostly sea" check now uses the dot's footprint.

### Judgement calls, flagged
- **No `backdrop-filter: blur`** on the pills or cards, though the reference has it. The project allows the blur in two places for phone performance; eleven blurred pills over a large photo is the case the rule protects against. The 62% dark fill carries the look. One property to restore.
- **Dots are gold throughout**, as the reference; the per-line colour the tiles' borders carried is gone from the marker (the spokes still carry it). One line to give the dot its line's colour instead.
- **Kicker** = number and line, since the brief didn't say.
- **The tile-size fields** on the artworks are gone; only the Your Story dot size remains per picture.

## THE MAP — rebuilt on two pictures — BUILT and PUSHED 19 Sep; both confirmed by Dom

Two new artworks replace the single 16:9 one: `the-map-landscape.jpg` (1536×1024, screens 768px and wider) and `the-map-portrait.jpg` (941×1672, phones, full width, no side-scroll). Both shipped as JPEG at 85 (540KB each; the PNGs were 3.9MB and 3.6MB). Decisions confirmed with Dom before building: `md` breakpoint, JPEG, bigger tiles on the portrait (14% of width, 3rem floor).

### What was rebuilt, per picture
- **Positions**: eleven stations, the hub, the Sociale label and the two Your Story bends, placed by eye against each picture, then rendered and looked at (the real component with the built CSS, at 350px and 960px), then checked by that picture's land mask and the geometry tests. Nothing copied between pictures.
- **Land masks**: `scripts/build-map-mask.mjs landscape|portrait` → `src/lib/map/masks/*.ts`, each with its picture's SHA guard. The colour rule changed from a teal ratio to blue dominance (`B > R + 25, B ≥ G, G > R`): the portrait's horizon haze (R131 G165 B192) failed the old rule and read as land. The flood fill from the picture's edge still decides.
- **Lines**: spokes from each picture's hub; the Your Story route is now a Catmull-Rom spline through its bends. The old Q-then-T chain mirrored control points and only worked for a run along the bottom; on the portrait, whose first leg is vertical, it threw the last segment out over the sea. The bend dots are HTML, not SVG circles, because the stretched SVG made them ellipses.
- **Tests**: every geometry and mask test runs for both artworks (52 map tests). They caught, on the landscape, a bend in the water and two tiles too close; on the portrait, three names off the right edge at 320px. The name-below-tile flip is now decided by geometry per picture, not a threshold: on these taller pictures nothing needs to flip.
- **Component**: `the-map.tsx`, `TheMap`, server-rendered: both layers in the HTML, one hidden per breakpoint in CSS, so the right map is there on first paint. The side-scrolling, dragging and keyboard-panning the old picture needed are gone; neither picture overflows.

### Found only by rendering
Names running under neighbouring tiles (the hotel's under La Boutique on both pictures, La Boutique's under Banco Allegro, the Sociale label over La Boutique), which no test sees: fixed by moving things, and the fit test's phone case widened to 320px. Worth keeping the scratch render around for the next time.

### Go-live
No migration. Desktop confirmed locally (a laptop briefly showed the portrait; the served CSS was verified correct and it did not recur). **Phone check on the live site still to do** (local network trouble, unrelated).

## LA STRADA — the roadmap page — BUILT and PUSHED 18 Sep after Dom's walkthrough

Brief: `docs/aOS_LaStrada_Roadmap_Brief.md`; mockup: `docs/aOS_Roadmap_Mockup.html`. Commits `4bae1d3` (the rename), `6a0696e` (the page), `8180061` (the start button reports its error). Migration `20260918120000_la_strada` applied. **Walked through by Dom: publish flow, ticks both ways, off-the-itinerary note, the real week count in the hero, all confirmed.** Verified: tsc, lint, build clean; **196 unit / 272 schema / 126 action**; ids, done-precedence, the publish guard and the notes policy mutation-checked. **Not yet seen rendered**: the page needs a signed-in session, so the first look is Dom's walkthrough.

### Naming
- **The Map** is the eleven-station journey map (`/stations`). Labels, alt text and back links renamed; file and component names (`la-strada-map.tsx`, `LaStradaMap`) deliberately kept.
- **La Strada** is the roadmap page, `/roadmap`, sixth nav item with its own icon (a road with stops). The admin "Roadmaps" links go to `/roadmap?edit=1`; `/admin/roadmaps` redirects there; both old editors (the standalone one and the one embedded on the admin member page) are deleted.

### The data-model question, answered
**Grouping by week works from the existing model, with two genuine gaps that needed columns, and one thing that changes meaning slightly.**
- **Works as-is:** months → focuses → actions, each action with `week` (1 to 5 of its month). The page groups a month's actions by that field into week cards (`actionsByWeek`, already there). Focuses are invisible on the page (new actions go into the month's first focus). Nothing about the structure had to change; the bucket pill is one more optional field on the action in the jsonb.
- **Gap 1, WHEN month 1 is.** Months were positional and "week 2" meant "week 2 of the month" with no month named; the log only ever needs "this week", so it never mattered. A page printing "Week 6 of 24" and "12 to 18 Oct" needs an anchor. New column `roadmap.starts_on`: the first Monday of month 1, set when Nina starts a roadmap (defaults to next month), editable in the hero. Older roadmaps without it fall back to the month after they were confirmed.
- **Gap 2, "done" as a state of the action.** The weekly log records "which actions did you do this week" per week and locks a signed-off week. A tick on La Strada is about the action and can be made from any week. New table `roadmap_action_ticks`; done = an explicit tick here, else "ticked in any week's log", else no. So a member who ticked something on a Friday sign-off sees it done on La Strada without doing anything; a tick on La Strada doesn't write to the log.
- **What changes meaning: "24 weeks".** A roadmap month is a calendar month and its weeks are the Mondays in it, four or five, as the onboarding cadence and the existing `week` field already count them. Six months is therefore 24 to 27 weeks, and the hero says "Week X of 25" (or whatever it is), not always 24. Fixed 4-week blocks would have made week 5 of a month impossible and drifted off the calendar by month 3. The mockup's dates (7 Sept, 5 Oct, 2 Nov 2026) are consistent with either reading because those months happen to have four Mondays.
- **New, as the brief said:** `roadmap_month_notes`, one "off the itinerary" note per member per month. Member writes; Nina reads (not writes).

### Judgement calls, flagged
- **Draft until published.** The brief says edits save instantly and there is no rebuild; both true. But a roadmap Nina *starts* is a draft the member can't see until she presses "Publish to {name}" in the hero. That keeps the 1:1 as the reveal and keeps the onboarding step "Your roadmap arrives" honest. After publish, every edit is live instantly.
- **Editing an action keeps its id**, even reworded. The old editor gave a reworded action a new id (it couldn't tell rewording from replacement on a whole-plan save). With a pencil on one action, it's an edit; the member's tick and note on it survive. Tested.
- **Profit's colour is The Map's deep red, not blush.** The brief says both "match The Map exactly, no new colours" and "Profit (blush)". The Map paints Profit `--aos-deep-red`. Matching The Map won; one line in `lib/roadmap/buckets.ts` if blush is right.
- **Bucket on an action** is set by Nina in the editor, falling back to the linked training's bucket, else no pill. Existing actions have none until she sets them.
- **Nina can tick on a member's behalf** in edit mode (recorded as the member's). Nina cannot write a member's off-the-itinerary note.
- **The mockup's italics** (month number, category badge, "Off the itinerary") were kept, though the brand rule reserves italic for quotes; the brief said to build from the mockup.
- **Orange toggle and buttons use ink text**, not the mockup's white, per the standing accessibility decision.
- **Hero overlay:** no "grand-hotel-riposo hero" technique existed in the code (the station header is a plain photo); built as `next/image` under `bg-navy/55`. The PNG (3.5MB) is now a 470KB JPEG at 2000px.
- **Months not yet written:** after the last month Nina has filled in, one divider. If that's month 4 or later: "Set at your Month 3 call", with the mockup's note. Earlier: "Still being written". In edit mode the next empty month is always shown so she can fill it.

### Go-live steps — all done 18 Sep
1. ~~Walkthrough~~ — Dom.
2. ~~`npm run db:push`~~ — applied.
3. ~~Push~~ — done.

## ROUND 4 — full screen-by-screen review — BUILT and PUSHED 18 Sep after Dom's phone walkthrough

Commits `a34648c`..`01f1ac9`. Brief: `docs/aOS_Round4_Full_Review_Brief.md`. Verified: tsc, lint, build clean; **189 unit / 272 schema / 118 action**. `20260918100000_hot_seat_questions` was pending when this was written and has long since been applied.

### Built, by screen
- **Global.** Header padded for the status bar (`env(safe-area-inset-top)`). The mark is the icon's own letterforms, outlined from Georgia Bold Italic (what the icon was rendered with), in orange, no square: `public/brand/aos-mark.svg`. Greeting by UK hour: buongiorno / buon pomeriggio / buonasera / buonanotte (was fixed text; item 3 answered: not built before, built now).
- **Onboarding.** "Your onboarding steps"; "Six steps to complete your onboarding". Order: video, form, tracking, call, roadmap, hot seat. Form and tracking parallel. Call locked until the form is in. Roadmap derived from a published roadmap only (no tick accepted). Hot seat locked until the roadmap arrives. Locked steps show why, no link.
- **Piazza.** One quote, Nina's. "Upcoming sessions" replaced by this member's check-ins this month. Calendar task says "The session is {time}. One tap adds it."
- **Hot seat.** Four new questions (`challenge`, `time_sink`, `should_stop`, `reflection`); `already_tried` and `done_looks_like` retired, kept, shown on the prep sheet only where present. Yellow box "What you'd like to hot seat"; "not sure yet" unchanged. Copy item 11. Month picker: upcoming plus each month with a submission; past months read-only.
- **Sociale.** Face and name on every received message; none on your own, as in WhatsApp (Dom, 18 Sep). Picture icon. Reactions behind one react button per message. Chips level. Burger in the thread header: rooms plus "new message" for anyone you don't have a DM with, plus the directory link.
- **Log.** Ten hours is prize-draw eligibility, on the screen and in the nudge email.
- **You.** Help & support mails contact@allegrobusinessservices.co.uk.

### Answers to the questions in the brief
- **9, the calendar "deadline":** real feature, test data time. The task is the `.ics` add-to-calendar link and its detail printed the session's `scheduled_for` with no framing. "Friday 18 September at 22:29" is the time Nina set on the test session. Reworded so it reads as the session time.
- **25, the member roadmap view:** **not built, by design** (the brief parked the full Roadmap screen). A published roadmap surfaces in two places only: every action as a checkbox on the Log's sign-off checklist (with month and week labels), and Piazza's "weekly goals X/Y" stat. Piazza's "This month: {station}" link only appears when `current_focus_station_slug` is set, which the roadmap editor never sets, so in practice it doesn't show. There is no page a member can open and read their roadmap as a whole. Nothing built here; it's the parked conversation.
- **26, creating a test roadmap:** no build. As Nina: `/admin/roadmaps?member=<id>` (or pick from the list) → "Add a month" (title) → focus title → "Add an action" (label, optional training, optional week) → "Publish to them". Then as that member: the onboarding step "Your roadmap arrives" ticks itself, Piazza's weekly-goals stat shows 0/N, and the Log's sign-off lists the actions as checkboxes.

### Judgement calls, flagged
- **The mark is outlined from Georgia**, because that is what the icon was rendered with; it matches the icon exactly. Not Cormorant. If the icon is ever redrawn, redraw the mark from the same file.
- **"Buonanotte"** for 22:00 to 05:00 stays. It's a goodbye in Italian rather than a greeting; raised, and Dom kept it on purpose (18 Sep). Not a loose end.
- **Item 8, "weekly check-ins submitted this month"** read as Friday sign-offs of the weekly log (`weekly_submissions.submitted_at` in the month), not posts in the Monday room. Confirmed by Dom, 18 Sep.
- **Item 12, Q1 kept the `challenge` column** rather than a new one: same question, and the prep sheet, Piazza and the confirmation all read it. So only two questions were retired; old answers to Q1 read under the new Q1 label, and old "already tried" / "done looks like" answers under their old labels where present.
- ~~Item 17 on own messages~~ own messages carry no name or face (Dom, 18 Sep), as in WhatsApp.
- **Item 21, "new message"** lists members with a directory profile who don't already have a DM with you; existing DMs are in the rooms list above it.

### Go-live steps — all done 18 Sep
1. ~~Phone walkthrough~~ — Dom, everything confirmed.
2. ~~`npm run db:push`~~ — `20260918100000_hot_seat_questions` applied.
3. ~~Push~~ — done.
Not yet seen: a past month in the hot seat picker (needs a second session to exist).

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
3. ~~**Step 13**~~ — **the flourishes are done** (flip-board counters, the FATTO stamp, self-drawing map lines, all built 30 Sep and independently droppable). What remains is **the Vespa intro video on first login** — not built, because there is no asset for it.

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

## The repository is public, on purpose (Dom, 5 October 2026)

`github.com/allegrostrategia/aos-portal` is **public**, because the Vercel
plan is Hobby. That is a decision, not an oversight — do not "fix" it by
making the repo private without asking, and do not assume privacy when
writing anything into it.

**Checked when the decision was recorded:** `.env.local` has never been
tracked, and no service-role key, Resend key or VAPID private key appears
anywhere in the history. `.env.example` documents variable names and holds
no values. RLS policies and migrations being readable is not a weakness —
the policies are the control, and they hold whoever reads them.

**What follows, and it is a rule now:**

- **No real client's figures or names in this repository.** Every worked
  example in `docs/reporting/reporting-tool-brief.md`, `formulas.ts` and
  `formulas.test.ts` is invented; the *shape* of the Meta exports is real,
  because that is what the importer has to cope with. A real client's ad
  spend, reach and funnel names were in all three until 5 Oct, when they
  were swapped for round invented ones — the tests assert the new numbers
  and still cover the same formulas.
- The state doc names Nina, Dom and Elize, and the `contact+test2@` test
  login. That is accepted. **A real client's name, address or figures is
  not** — it goes in a document, not in the repo.

## Decided on Nina's behalf, for her final review

A running list. Every time a question is really hers and the build could not
wait, the answer taken goes here with the reason — so her final review is a
list of things to confirm or overturn, not an archaeology exercise.

**Nobody joins until Stages 4–6 are built, and Nina reviews once, at the
end** (Dom, 8 Oct). So this list will get longer before anybody reads it,
and that is the arrangement rather than a backlog.

**At the end of Stage 6, `docs/nina-review/` is regenerated to cover every
stage, with this list as its first section.** On the launch checklist too,
because it is the kind of thing that gets forgotten precisely because it is
last.

### From Stage 3 (the review pack, 7 Oct)

1. **The two sentences for figures where falling is good.** Churn, cost per
   lead and clients who left were coming out backwards — two fewer clients
   leaving read as "2 MORE clients who left - stunning". Nina gave the
   replacement wording on 6 Oct and it is in; what she has not done is see
   it in place.
2. **Targets appear in the metric list's own order, not worst-first.** So
   the same five bars stay in the same places month to month and she can
   find one by eye rather than by reading.
3. **Two figures that are one piece of news show one sentence.** "Issues
   raised up 3" and "Issues per 10 clients up 1.0" are one event told
   twice, so only the plain count appears — but two figures genuinely
   telling different stories both still appear.
4. **Benchmarks are per client, not per funnel or per campaign.** One
   benchmark per figure for the whole business.
5. **A figure nobody can work out shows a dash, never a guess.** The cost
   is that a month where nobody typed "0" shows a dash rather than a
   number.
6. **Primary buttons are orange with ink text, not white.** White on the
   brand orange is ~2.9:1 and fails AA. The one place the screens
   deliberately differ from the L'Editoriale reference poster, on
   readability rather than preference.
7. **Only the campaign with no goal set is flagged in the Ads Goal
   column.** Campaigns with a goal leave it blank; the problem is what gets
   named.

### From Stage 4 (the plan, 8 Oct — Dom approved for now)

8. **The planner's first-launch defaults are 47% show-up and 5%
   conversion** — the numbers in Nina's own worked example in the brief, so
   its first answer matches one she has already sanity-checked. Editable.
9. **A launch's status is set by hand**, with nothing changing it
   automatically. Dates slip, and "finished" is a judgement about whether
   the cart is really shut.
10. **Publishing a launch does not email the client.** Publishing a month
    does. The launch page becomes visible and the next monthly report is
    where it is mentioned — one email a month rather than two.
11. **"Compare launches" is the team's screen only.** Showing a client this
    launch against their better one is a conversation Nina should choose to
    have.
12. **A launch's cover image is optional.** A launch mid-flight should not
    be blocked on finding a picture.
13. **Sales by source that does not add up warns, and does not refuse.** A
    real launch has sales nobody can attribute, and forcing them to
    reconcile would mean inventing an attribution. (This one is the
    brief's own answer, kept.)
14. **The monthly Launches tab lists the launches whose live dates fall in
    that month**, as cards linking through — so a month's report says a
    launch happened without duplicating its figures.
15. **A published launch's status may still change; nothing else about it
    may.** Planning → Live now → Completed describes the launch rather
    than the report, and a client looking at "Live now" three weeks after
    the cart shut is worse served than one whose badge changed quietly.
    **Checked before deciding: `status` feeds no figure.** It appears only
    as an enum, a column and an index — in no formula, in none of the 46
    launch metrics, and in no calculation. Every figure beside it is held
    by the lock. One line to reverse (Dom agreed 8 Oct).
16. **Pitch retention is measured against the audience when the pitch
    began**, not when the session began. §6.2's table says "live at
    start", which would leave "Live at pitch" collected and never used —
    and a figure the brief asks for and never spends is better read as
    the one it meant. It changes a number Nina will quote out loud, so it
    needs her word (Dom, 8 Oct).
17. **Conversion rate is measured against the main selling stage's live
    attendees**, not every attendee of every stage. A launch with a
    waitlist and a challenge before the masterclass would otherwise read
    as converting a fraction of a far larger number. §6.4 says this; it
    is listed because it is the kind of thing that looks wrong at a
    glance and is right.
18. **The panels repeat their tail on every line, and nothing has been
    changed about it yet.** Stacked, three sentences ending "…not the
    direction we want, let's dig into WHY" read as templated rather than
    written. Three ways out, for her to pick:
    **(a)** the tail on the first line only, the rest plain;
    **(b)** two or three rotating versions she writes;
    **(c)** the tail once under the heading, and the lines plain.
    **Recommended: (a)** — it keeps her voice where the eye lands first
    and costs her no new writing. Nothing is built either way until she
    chooses (Dom, 8 Oct).
19. **A phone shows the sections as a dropdown, not tabs.** Eleven tabs
    in a sideways scroller left the one you were on off the screen —
    measured at 390px — and two attempts to scroll it there failed. The
    bar is now a disclosure saying where you are, opening to the full
    list. Built as plain HTML rather than a `<select>` and a router,
    because the select never navigated: it needed hydration, and this
    project has now been caught twice by behaviour that only exists once
    the JavaScript arrives. It also fixes today's off-screen Financials
    (Dom, 8 Oct).
20. **A stage with one email shows its open rate on the dot.** One point
    has no line to read, so without the number it looks like a stray
    mark. The alternative Nina may prefer: leave single-email stages off
    the chart entirely and show them as a figure beside it. Labelled on
    the chart for now (Dom, 8 Oct).
21. **Does "Total hours spent delivering" going up count as bad?** It is
    marked good-when-falling today, so a month where she delivered more
    reads as a problem — which is right for efficiency and wrong for a
    growing business. Her call, and it is one line.

### From finishing Stage 4 (9 Oct — Dom approved for now)

22. **A cover image sits above the figures on the launch report, at 3:1,
    full width.** §6.1 asks for one and never says where it goes. Above
    the KPI cards is where a magazine would put it and where the eye
    starts; the alternative is small, beside the title. It is optional
    (decision 12), so most launches will not have one at all.
    *Recommended: leave it as built.*
23. **A launch keeps one cover, overwritten in place.** Replacing a
    picture does not keep the old one, and there is no gallery. Simpler
    to explain and it cannot grow without limit. *Recommended: keep.*
24. **The eight save confirmations are "Saved.", "Status saved.",
    "Stages saved.", "Price options saved.", "Figures saved.", "Nothing
    to save.", "Cover image saved." and "Cover image removed."** They
    are now in one file (`src/lib/reporting/saved-notice.ts`) rather
    than scattered through the forms, so she can reword all of them in
    one place. *Recommended: she reads them once and changes any that
    are not how she would say it.*

### From Stage 5 (the plan, 9 Oct — Dom approved for now)

25. **A member finds Reporting on You, plus a Piazza card while last
    month is unfinished.** The six-item navigation is settled and this
    is a once-a-month task; a seventh item would be the most prominent
    thing on every screen for the twenty-eight days nobody needs it.
    **The card is private to that member** — it is not a post in the
    shared feed, and nothing about one member's report reaches another
    (Dom, 9 Oct, in the same spirit as the Friday reflection).
26. **"Core fields" are the ones already marked `core` in the metric
    list**, seeded from §5 of the brief. Two consequences she should
    know: a category she has no entities in (no funnels, no ad
    campaigns) counts as done rather than permanently orange, and
    **"Clients at the start, when you joined" is asked once, not every
    month** — it is carried forward, so requiring it monthly would keep
    Client Experience orange forever.
27. **Hiding a category is display-only.** Nothing is deleted, un-hiding
    brings everything back exactly as it was, and a figure pulled into
    another section still works while its own section is hidden. Rule 7,
    applied to a toggle (Dom, 9 Oct).
28. **Reminders go to nobody who has left.** Not to a cancelled member,
    not to a Chiarezza login past its end date, and the 1st and 8th are
    **UK time** — a job that fires at midnight UTC sends on the 31st in
    British Summer Time (Dom, 9 Oct).
29. **The panels say "we", which reads oddly when a member is reporting
    on themselves.** "We didn't hit the target we wanted" is Nina's
    voice talking to a client; a member reading their own report is
    being addressed by nobody. Does she want a second set of wording for
    self-serve, or does "we" stand? *Recommended: ask her — it is her
    voice and there is no right answer from here.* It is roughly a day
    of writing for her and a key on each template for us.
30. **A member's reporting workspace is created automatically** when the
    member is created, so nobody can arrive at "no access". *Recommended:
    automatic.* What it touches is in `docs/stage-5-plan.md`; the short
    version is that `members` has no business name, so the workspace
    starts named after the person and the first-time setup screen is
    what corrects it.

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
- **A decision on `client_experience_active_clients_at_start`** (added 2 Oct) — §5.8 of the reporting brief specifies it two incompatible ways: "last month's active at end" *and* "the very first month asks for active clients at start as a one-off input". A field that is pulled in most months and typed in one, which the schema refuses outright. Blocks Stage 3's Client Experience page.
- **Four questions on the §8 plan** (added 2 Oct, amended 3 Oct) — who gets the publish email, whether a client may reply more than once, whether objectives are hers alone or Elize's too, and whether republishing a corrected month emails again. The plan is a document, not in this repo.
- **Four questions on the Stage 3 plan** (added 3 Oct) — charts first or Stage 3 in order; which of three ways out of the §5.8 contradiction; the two-column benchmark migration; and six sentence templates for "Look at these first" in her voice.
- **The two mockup arithmetic errors** (added 2 Oct) — the launch planner card shows **600 sign-ups where §6.6's formula gives 1,277**, and the Social Media entry mockup shows a **6.9% engagement rate where §5.2's formula gives 9.34%** (6.9% leaves out the saves and shares the formula includes). Both are built to the brief and pinned by tests. The mockups are client-approved, so correcting them may mean going back to whoever approved them.
- **The September draw's prize** — the `draws` row for September still has the literal prize `"test"`, so the Piazza card reads "test.". Set the real prize in `/admin/draw`, or delete the row and let the fallback copy show.

## Waiting on Dom
- ~~**The Stage 2 live walkthrough**~~ — **done 2 Oct on Test Client**, two months entered, one published, checked as the client. Six bugs found and fixed.
- ~~**Checking the walkthrough fixes on localhost**~~ — **done 2 Oct**, all five confirmed, pushed as `b08c929`.
- **Checking the sign-out on localhost** before `5c208da` is pushed — the one client-facing commit waiting.
- ~~**Whether a published month should be editable at all**~~ — **answered
  7 Oct: lock it.** Built, applied and live. See "7 October — a published
  month stops changing".
- ~~**The freeze plan's decisions 1, 2 and 3**~~ — **all four answered
  7 Oct, built, applied and live.** See "a published month keeps what it
  went out with". `docs/freeze-plan.md` is kept as the record of why.
- **`author_name` is still free text for its rightful owner** — closed for
  everyone by `20261007120000`, so this is now only a note that the name on
  a note is derived, not chosen. Nothing outstanding.
- **Nina's review of the Stage 3 screens**, and then the launch checklist.
  These are the only two things between here and moving `SHIPPED_STAGE` to
  3. Screenshots at both widths are in `e2e/screenshots/`.
- **The same walkthrough on a REAL retainer client**, which is the last piece of §11.2 and the only part that emails somebody. Create them from `/admin/reporting` **on the live site** — invitations refuse to send from a dev server, because the link they build would only work on the machine that sent it.

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
**Seventy-eight on disk, all seventy-eight applied to live (7 Oct).** No
gap: `20261006180000_top_items_delete` was deleted rather than applied —
its policy moved into the lock migration, because a delete policy without
the guard is the hole the lock exists to close.

The five on 7 Oct (`lock_published_months`, `client_reply_is_the_clients`,
`a_note_is_signed_by_its_author`, `an_entity_is_retired_not_deleted`,
`carried_figures`) and
the three on 6 Oct went in through the Management API, each inside one
transaction with its own `schema_migrations` row, and each **verified by
reading the result back** — the triggers from `pg_trigger`, the policies
from `pg_policies`, the foreign keys' `confdeltype` from `pg_constraint` —
never by an exit code.

**Sixty-eight on disk, all sixty-eight applied to live, and `migration list --linked` shows `local == remote` for every one.** The ten dated `20260930` (the reporting tool's Stage 1) went in on 30 Sep via `npm run db:push` from Claude Code's shell, which worked normally this time, and were verified over PostgREST afterwards rather than on the exit code: `report_metrics` answers with 174 rows to the service role and **zero to anon**, so RLS is live and not just local.

**This section said "thirty-one" from early September until 30 Sep, and then briefly "forty-one".** The first was stale; the second was me adding ten to the stale number instead of running `ls`. It has now been counted. Same failure as the "thirteen"/"fourteen" note below, in the same paragraph that warns about it — **count the files, every time.** The fourteen from 1–3 Sep (six dated `20260901`, eight dated `20260903`) went in by hand through the SQL Editor while the CLI couldn't connect; the seventeen before them went through the CLI normally.

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
- **An admin's RLS view is not their own view.** A policy of `using (is_portal_admin())` returns every row, so any code doing `rows.find(matching the thing I'm looking at)` and reading an identity off the result gets somebody else's — the client's, on a workspace with one client and one admin. Filter by `user_id` when the question is "mine", even where RLS already returned something plausible (state doc, 5 Oct; it signed Nina's notes with the client's name).
- **A test for a race or a tie needs the condition to actually occur.** A tie test over rows that do not tie, or a paging test the engine happens to answer consistently, is a green light wired to nothing — mutate the code it guards and watch it fail before believing it. Where the engine is merely *permitted* to misbehave, make the harness misbehave on purpose (`unstableTieBreakers` in the shim).
- **Default to plain HTML for anything interactive — forms, links, `<details>`/`<summary>` — and reach for JavaScript only when there is a real reason.** Three controls in this build worked only once hydrated, and all three were silently wrong before that: the publish confirm *published the month* on the first click, the phone tab bar never scrolled the current tab into view, and "+ Another stage" added no row at all. A browser clicks faster than a dev server hydrates and so does a person on a slow phone, so the broken state is the normal one. A `<details>` opens, a link navigates and a form submits with no script at all (Dom, 8 Oct).
- **Read the runner's own exit code, never a pipeline's.** `npx playwright test | tail -20` exits with `tail`'s status, so a run that failed 12 tests reported success on 7 Oct and was believed for a minute. Capture it on its own line — `cmd > log; echo "EXIT: $?"` — and read the summary line out of the log.
- **Wait on the thing, not on a process name.** A loop watching `pgrep -f "playwright/cli.js test"` reported the suite finished while it was on test 88 of 92, because that is not the process Playwright runs. Wait for the output a finished run produces.
- **Do not infer a deployment from content fingerprints.** A server-action id, a build id or a static file's `last-modified` will not tell you whether a push went out: ids are not comparable between a local build and Vercel's, and Vercel reuses an unchanged file's blob and mtime. Read the Vercel dashboard, or probe a behaviour only the new code has. Claude called a healthy deploy stalled for an hour this way on 5 Oct.
- **A failing probe is a claim about the probe until it has been read.** Two false negatives on 5 Oct came from the probe, not the system: a fingerprint sampled after the event it was meant to detect, and a `like '%before insert or update%'` run against DDL Postgres prints in capitals.
- **Compute a palette, never look at it.** Two of the brand's six colours cannot be told apart by a protanope (blush/lemon, 0.5 separation) and two more fail the floor for full-colour readers. Both pairs look fine on screen. `scripts/check-chart-palette.mjs` prints the numbers; run it before adding a series colour, and remember a low-contrast fill owes the reader an edge and a labelled legend.
- **Colour follows the entity, never its rank.** Sorting slices by size and then colouring them by position means a thing changes colour the month it overtakes another. Take the colour from a stable key and sort only what the reader reads.
- **Render the page and read it.** Five bugs on 6 Oct were invisible to 456 unit tests and obvious in a screenshot: two pages that rendered nothing, a card disagreeing with its report, money rounded to "£0", and a sentence saying the opposite of what happened. A test that does not draw the screen cannot see the screen.
- **A block goes after what it reads, not next to what it relates to.** Two ReferenceErrors in two days, both from inserting a block beside related code rather than below its dependencies, both taking a whole page down.
- **A probe that stops where the code stops proves nothing about the code.** The live-chat probe (bug 26) first checked for `SUBSCRIBED`, exactly as the broken code did, and reported the channel healthy. When verifying a claim, the check has to go one step further than the thing being checked.
- **Anything that has to be done in a dashboard is a step that can silently not happen.** Publication entries, buckets, policies: write the migration, guard it for the local harness, and assert the result in `test:db`.
- **When a test disagrees with live, suspect the harness as readily as the code.** The PGlite shim diverged from PostgREST three separate ways in one afternoon — a types-only method it didn't have, a foreign key it guessed from a table name, and an upsert default it got wrong — and every one of them made correct code look broken. Fix the harness; it is supposed to bend, not the app.
- **Measure the viewport before believing a screenshot.** Chrome headless has a 500px floor on `--window-size`, so a "390px" shot is a cropped desktop render. That looked exactly like a horizontal-overflow bug and cost three wrong fixes. Put a numeric readout on the page, or drive `Emulation.setDeviceMetricsOverride` over the DevTools protocol.
- **Read the dev server's log, not just the screen.** A nested `<form>` was failing hydration and the Next overlay had been saying "3 Issues" for an hour before anybody looked.
- **A comment claiming the code does something is not evidence that it does.** Two bugs this week sat directly under comments asserting the opposite — a setup form "beside, not inside" the one it was nested in, and a guard whose stated column rules it didn't enforce. Treat such a comment as a bug report, the same way the column-ownership rule above says to.
- For a build this size, start a fresh session per major step or per day rather than one marathon.

## Right now, exactly

**Steps 1–13 are done but for one piece.** The membership product is feature-complete for the current scope: onboarding, Piazza, The Map, La Strada, the log and timer, the hours ledger, the hot seat, chat and the directory, peer pairing, the monthly recap, the draw, Archivio, the reveal, milestones. The exception is **Step 13's Vespa intro video**, which has no asset — the only item left in the open list.

**The live work is the reporting tool.** Stages 1 and 2 are built, pushed,
applied and **Stage 2 is closed** (5 Oct, on Test Client). **Stage 3 is
built and pushed, and switched off** — `SHIPPED_STAGE` is 2, so none of it
reaches a client, and a browser test runs the same app at the production
flag to prove the Overview is unchanged. Re-checked on live as Test Client
after the push: six tabs, two months, both widths, nothing of Stage 3
anywhere.

**The order from here is settled** (Dom, 8 Oct): **Stage 4** (Launches),
then **Stage 5** (aOS members), then **Stage 6** (Meta CSV import). Nobody
joins until all three are done, and **Nina reviews once, at the end** —
so the Stage 3 flag stays at 2 throughout, however finished Stage 3 looks.

**Stage 4 is COMPLETE** (9 October), behind `STAGE_4`, so none of it
reaches a client: the list, the report, the planner, the setup screens,
the cover image, the entry screens, "Compare launches" and the monthly
Launches tab. Checked line by line against `docs/stage-4-plan.md` —
every item in "What is left" is built, and the two gaps that audit found
are closed:

- **The cover image was not built at all.** The bucket was live and the
  column had existed since 30 September, and nothing read or wrote
  either. Now a plain multipart form to `/api/launch-cover`.
- **The bucket's assertion in the schema test was missing**, which the
  plan had asked for in the same breath as the migration.

Five migrations live, plus one waiting on Dom — the launch lock, the
private cover bucket, the delete sweep, `carried` on launches, and
**`20261009100000_launch_covers_admin.sql`, which is NOT applied yet**.

**Two bugs the finishing work turned up, both silent:**

- **Every save put the launch's status back to "planning".** `status`
  moved into a form of its own when a published launch needed to change
  it (a disabled field does not submit), so the details form stopped
  posting one — and `?? "planning"` filled the gap on every save.
  Nothing refused it, because the lock exempts status on purpose
  (decision 15), so the guard waved it through too.
- **The cover bucket refused Nina outright.** All four storage policies
  rest on `report_can_edit` / `report_can_read_launch`, and both ask one
  question: is there a `report_access` row for this login. An admin has
  none. Every table in the module grants the admin through a separate
  permissive policy (`report_launches_all_admin :: is_portal_admin()`);
  the bucket had no such arm, and the migration's comment said the
  opposite — that an admin "carries the service key", which a browser
  session does not.

**Saves no longer answer through `useActionState`.** A successful save
redirects to `?saved=<key>` and the page renders the sentence
(`SavedBanner`), because the returned notice was caught disappearing
under load: the POST succeeded and nothing appeared, the form having
submitted natively before React attached. Proved by two browser tests
that run with **JavaScript disabled** — a save says it saved, and an
error still says what was wrong. Errors stay in the action's return
value, so what was typed stays in the boxes.

**And a 303 from a route handler uses a relative `Location`.**
`request.nextUrl.origin` is Next's idea of the origin, not the host the
browser used: in the test stack it resolves to `localhost` while the
browser is on `127.0.0.1`, a different origin for cookies — so the
redirected GET arrived with no session and bounced to `/login` with the
upload already done. The same gap exists behind a proxy in production.

**The test count is now guarded.** `npm run test:census` records how many
tests each suite has in `test-counts.json` and refuses a drop; lowering
the number by hand needs a `droppedBecause` line in the same commit. It
exists because overwriting `months.test.ts` destroyed fourteen tests on
8 October and the suite reported "463 passed, 0 failed" — a deleted test
does not fail, it stops existing. Re-enacted against the guard, which
says "20 disappeared".

**Three things Stage 4 taught, each of which cost real time:**

- **A class holding a `Map` cannot cross into a Client Component.** React
  refuses it outright — "Only plain objects, and a few built-ins" — and
  the whole route 500s. `LaunchValues` is fine on the server (the report
  page reads it directly); the entry form needed `values.fields()`, a
  plain object. The server-only boundary bites the same way: the field
  name builder had to move to `src/lib/reporting/launch-fields.ts`,
  because `launch-queries.ts` is `server-only` and the form is not.
- **A mutation run overwrites the screenshots.** A deliberately broken
  build got past the visibility assertions, shot an entry screen with
  every box blank, and only then failed. The blank screenshot sat on disk
  looking like a real bug. **Regenerate screenshots after mutation
  testing, before looking at them or committing them.**
- **Name a form field in exactly one place.** Each box on the entry screen
  was named by a template literal and filled from a differently-shaped
  key — `-` for "none" in one, `""` in the other. The only symptom would
  have been a box that came back empty. One builder now, pinned to the
  harness's hand-written spelling by a test, so a drift in either is
  caught where it happens rather than on screen.

**Stage 5 is planned and waiting on Dom**: `docs/stage-5-plan.md`. The
shape is the mirror image of Stage 4's — Stage 4 had the arithmetic and
no screens; Stage 5 has screens that already work for any workspace kind
and **no way for a member to reach them**. The access rules, the
`hidden_categories` column (honoured on read), `report_reminders`, the
setup columns and the `reflection` note type all exist; what is missing
is a route in, first-time setup, a screen to hide a category, the
completion definition, the two Piazza reminders, the reflection screen,
the admin members view, and Chiarezza's end-of-access behaviour.

**One thing to settle before building it**: nothing in the code defines
a "core field" today, and the orange markers, the completion count, the
reminders and the admin view all rest on it. Either a flag on
`report_metrics` (a migration and a regenerated seed) or derived from
what is there already.

**`docs/nina-review/` is Stage 3 only** and is regenerated at the end of
Stage 6 to cover everything. The running list of what was decided for her
is in "Decided on Nina's behalf, for her final review".

**The 6 October hole is closed.** A published month is locked — figures,
notes, objectives, top-three lines and month-keyed targets — and
corrections go unpublish → fix → republish, which emails the client. Live
and verified.

**And what it uncovered is closed too.** A published month no longer
derives anything at read time: it keeps the figures, the comparison, the
targets, the benchmarks and the row labels it went out with. Proved by
diffing every Stage 2 tab as the client before and after the change —
twelve files, no difference.

**What remains live history, on purpose:** trend charts and the Proven
marker. On the launch checklist.

**One decision is needed before Stage 3 touches Client Experience:**
`client_experience_active_clients_at_start`, which §5.8 specifies two
incompatible ways. See the reporting section.

**To pick this up fresh: `CLAUDE.md` + this file, nothing else needed.** For reporting work also read `docs/reporting/reporting-tool-brief.md`; its §13 is the instruction set for that feature and it is specific.
