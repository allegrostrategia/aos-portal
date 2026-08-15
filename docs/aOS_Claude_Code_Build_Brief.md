# aOS — Claude Code build brief
*Built function by function. Each section reflects exactly what's been decided, in Nina's own words where it matters.*

### Global requirement: mobile and desktop, both fully functional
This applies across every section in this document, not just where it's mentioned specifically — the whole product needs to work superbly on mobile and desktop, not desktop-primary with a mobile fallback. Already called out for Piazza and La Strada specifically (the map's pan/zoom interaction), but it's a standing rule for onboarding, the weekly log timer, hot seat submission, the library, chat, all of it. Worth Claude Code treating this as a constraint from the first line of code, not a responsive pass done at the end.

---

## 1. Onboarding

### Cadence — fixed monthly cycle, same for every cohort
- **Week 1** — monthly hot seat, for all active members (including a cohort's very first one)
- **Week 2** — new cohort joins. Onboarding time tracking, part 1.
- **Week 3** — onboarding time tracking, part 2.
- **Week 4** — 1:1 call with Nina + roadmap (La Strada) delivered.
- **→ Week 1 of the following month** — that cohort's first hot seat, in sync with everyone else's.

This means a new cohort's first hot seat never needs special-case scheduling logic — because hot seat is fixed to week 1 every month, it naturally lands the moment onboarding completes.

**Resolved: hard rule.** Enrolment is closed outside week 2, no fallback.

### Step zero — the welcome session
Before the audit form, before anything else. A recorded (not live) session from Nina — recorded once, watched by every future cohort, so it doesn't become a standing monthly time commitment.

**Purpose:** sets the culture, not the mechanics — the audit form teaches *how*, this teaches *what kind of space this is*.

**Content:**
- The actual programme promise: one real thing that's costing time or money gets built, live, based on real data — not talked about, not guessed at
- Why they're here, what's expected of them
- What this isn't: not optional attendance with no output, not advice-on-demand, not unlimited access to Nina outside the structure, not a space to sit passively and expect momentum to happen on its own
- Teaching the actual method/philosophy behind the whole approach

**Gating:** the natural first step after payment — audit form unlocks once it's been watched. Light-touch, no quiz, just sequence.

**Schema:** `welcome_session_watched_at` timestamp on `members`.

### The itinerary
On day one, alongside the welcome session, the member receives a themed, personalised itinerary — their actual dates, not a generic calendar. Styled like an old-world travel itinerary or ticket, not a plain calendar export, so it sits inside the world rather than outside it. This is the physical form of the "key" from the Grand Hotel Riposo concept.

**Shows:** welcome date, both tracking weeks, 1:1 date, first hot seat date.

**Also needs:** a short, light-touch note on what happens if a step is missed — a tracking week, the 1:1 — so it's not a silent unknown. Doesn't need to be heavy-handed, just present.

### The audit form
- One form combining: 2 weeks of time tracking + whole-business snapshot questions — not a separate/later feature, live from day one
- Needs proper design, not a generic form
- Needs an **admin-accessible view** — Nina/team can see submitted data per client
- Feeds three things: the roadmap build, the start of case-study material, and ongoing progress tracking across business areas

**Also required during onboarding:** the member directory listing (name, title, bio, headshot, links) — see Section 10 for the full field spec and copy.

**Resolved approach — multiple choice during onboarding, depth happens live:**
1. **Onboarding audit** — multiple-choice per station, same pattern as the existing website quiz, to establish which "pot" (station/bucket) the member scores weakest in. Fast, low drop-off risk, reuses a proven pattern rather than inventing a new one.
2. **Call questions template (new deliverable)** — a structured set of deeper follow-up questions Nina uses live in the 1:1, informed by the quiz result. Claude can draft the relevant follow-ups based on which pot scored highest, Nina uses judgement live — same "AI drafts, Nina confirms" shape as everywhere else in this build. **Must still capture a specific current pricing/rates number** during this live conversation — needed for the pricing/leverage flag in the weekly log (see Weekly Log section) — a narrative answer alone won't give a comparable figure.
3. **The roadmap reveal document (new)** — a one-time, bespoke HTML document generated per member from the quiz + call answers, handed over at the end of the 1:1 before they even log into the portal. Genuinely bespoke per person is correct here, unlike the portal's live La Strada, because this is a point-in-time artifact that never needs updating. Adapts the existing `allegro-roadmap` skill's diagnosis and priority-card structure, drops all sales/pricing/ROI content (not needed, they're already a paying member), and replaces the sales timeline with an actual route visualisation echoing La Strada. Uses aOS's own type system (Inter + JetBrains Mono) rather than the skill's default DM Sans, so it reads as the first page of aOS itself. Generated via the same "Claude drafts from call data, Nina confirms" pattern as the rest of this build. See `Sample_aOS_Roadmap_Reveal.html` for a worked example.

**Still Nina's action item:** the actual multiple-choice questions and answer options for the onboarding quiz itself.

### Onboarding-stage access (locked vs open)
A member's access is different during onboarding than once active — enforced by `status` on the `members` table.

**Open from day one (join date, not gated to week 2):**
- Time tracking
- Onboarding audit/snapshot form
- Member directory
- General chat
- Wins channel
- **Time-tracking discussion channel** — a space to talk through what they're noticing in their own numbers. Not onboarding-only; stays live once active too, just most valuable during the quiet onboarding weeks specifically
- **A small starter set of trainings** — same for every onboarding member, not diagnostic-matched (that logic doesn't exist yet). Draft set: *Looking at the data in your business*, a finance tracker/pricing calculator tool, *Income generating activities*, *Task management basics*. Needs Nina's sign-off against the full list.
- **A handful of hand-picked "trailer" replays** — real past hot seat builds, visible specifically to onboarding members, so the quiet weeks show proof of what's coming rather than nothing at all
- **As built (Step 2):** the full station list itself is visible but greyed during onboarding, not hidden — same "show proof of what's coming" reasoning as the trailer replays. **Grand Hotel Riposo stays fully open**, since that's where onboarding activity actually happens.

**Locked until `status = active` (week 1 of the following month):**
- The full, diagnostic-matched training library
- Hot seat
- Peer pairing — built around a live challenge, which onboarding members don't have yet
- Prize draw eligibility — earned by a full month of active check-ins

### Priming content (the check-in screen's third job)
The weekly check-in screen already collects time tracking and (once active) the challenge/actions-taken fields. During onboarding, it also drips one short piece of priming content per week — same screen, no new area to visit.

- **Week 2:** why the tracking matters, what it's about to reveal
- **Week 3:** getting their numbers ready — a short finance-prep checklist
- **Week 4:** what to expect in the 1:1

**Important distinction:** this content is universal, not personalised — every member sees the same three pieces regardless of business type or data. The moment it becomes tailored, it needs the same diagnostic logic as the real library, which defeats the point of it being available before any diagnosis exists.

### Data structure (Supabase)
- **`members`** — extends existing user table. Needs `join_date`, `onboarding_start_date`, `cohort_start_date`, `status` (onboarding / active / cancelled), `contract_term_months`, `contract_term_end_date`, link to current roadmap
- **`member_audits`** — renamed from `onboarding_audit`, since the audit is no longer one-time: holds multiple submissions per member, discriminated by an `occasion` field (`onboarding | recommit`). Comparing a member's onboarding snapshot against their 6-month recommit snapshot is itself a real feature — the first point the product can show someone genuine movement in their own numbers.
- **`weekly_submissions`** — one flexible table, reused across the member's whole lifecycle: onboarding time-tracking in weeks 2-3, then tracking + challenge + actions-taken every week once active. Same shape throughout, fields populate differently by stage.
- **`roadmap`** — phases as structured data + a `current_focus` field. **As built (Step 1, verified):** "which roadmap is current" is tracked via `roadmap.is_current` with a partial unique index, not a `current_roadmap_id` pointer on `members` — same reasoning as `recommit_completed_at`, one source of truth rather than a pointer and a flag that can disagree. Tested: a member can't have two current roadmaps.
- **`roadmap_history`** — needs a `reason` field (`onboarding | monthly_repoint | recommit`), since a fresh 6-month recommit roadmap and a routine monthly nudge are different events and the history needs to tell them apart
- **Admin view** — a screen querying across the above, not a separate table
- **RLS** — reuse the existing `get_my_role()` security-definer pattern already working in Allegro Portal, plus the `has_portal_access()` gate (below) on every table added from here on

### Membership lifecycle — term, cancellation, renewal
- **`status`** on `members`: `onboarding | active | cancelled` — no pause state
- **6-month minimum term**, then rolling monthly. Term length itself is enforced by the signed contract and HeyClients/Stripe billing, not the app — the app just needs `contract_term_end_date` on `members` so admin can see who's approaching it
- **At the 6-month mark:** member gets a fresh 6-month roadmap as an incentive to recommit rather than just drift to rolling. This is a **new live 1:1 with Nina**, same shape as the original onboarding call — preceded by a refreshed audit (updated business snapshot, current pricing, same quiz structure as onboarding) so Nina walks in already briefed. The new roadmap reuses the same `roadmap`/`roadmap_history` tables, just triggered by contract term end rather than the routine monthly re-point
- **Cancellation:** revokes all access (no portal login, no library, no hot seat) but **nothing gets deleted** — the member's row, weekly submissions, roadmap history, and handover pack all stay intact
- **Rejoining:** goes through onboarding again from scratch (fresh audit, fresh roadmap — their business has likely changed), not instant reactivation. Their old handover pack stays visible to them as history, not wiped

**Member creation itself is admin-only, not self-serve or webhook-triggered:** requires both `payment_confirmed_at` and `contract_signed_at` timestamps to exist before a member record can be created — enforced in the database via a security-definer function, not just a form checkbox. No auto-create on signup.

**As actually built (Step 1, Claude Code):**
- `has_portal_access()` — a single helper returning `status <> 'cancelled'`. This is the one gate everything checks, not just an ownership check — every table added from here needs it in its RLS, standing rule 6 in `CLAUDE.md`, specifically so a cancelled member never keeps access through a table that forgot to check.
- `cancel_member()` and `rejoin_member()` — both admin-only, neither deletes anything. `rejoin_member()` refuses to run on anyone not already cancelled, and puts them back to `onboarding` (never straight to `active`), resetting `onboarding_start_date` and clearing `welcome_session_watched_at` so the sequence genuinely restarts from the beginning. It also starts a fresh 6-month `contract_term_end_date` from the new onboarding date, since a rejoin is a new contract.
- `join_date` never changes, even across a rejoin — "member since" survives. `onboarding_start_date` is the actual sequence anchor, and resets on rejoin.
- `contract_term_months` — `not null default 6`, kept as a column rather than hardcoded so a bespoke agreement can differ, but 6 is the standard.
- `contract_term_end_date` — set at creation as join date + term, with an override parameter so it can be matched to whatever HeyClients actually bills. This is the one field that isn't purely reference — it's what surfaces the recommit milestone. It does **not** roll forward at the 6-month mark; membership goes rolling monthly after that, so this stays as the end of the initial commitment and becomes historical once passed, rather than extending monthly. A partial index on this excludes cancelled members, for admin's "who's coming up for recommit" query.
- `member_status_events` — an audit log of every status transition (not just a current flag), powering an `is_returning_member()` check. More than originally specified, kept deliberately, since it's exactly the kind of real record this build already values over guesswork.
- **The 6-month recommit, resolved:** a live 1:1 with Nina, same shape as the original onboarding call — not async. Preceded by a `member_audits` submission with `occasion = 'recommit'`, reusing the exact same question structure as onboarding (updated business snapshot, current pricing). Produces a new roadmap logged with `reason = 'recommit'` in `roadmap_history`, same tables as the routine monthly re-point, just a different trigger and a different weight.
- **Handover pack / Archivio note (not yet built, recorded for when it is):** its RLS must gate on `has_portal_access()`, not `status = 'active'` — otherwise a rejoined member sitting in onboarding would lose sight of their own past work, even though nothing was deleted. Written down now so whoever builds that table later doesn't get caught by it.

---

*Sections to come: La Strada, weekly log, hot seat, training library, handover pack, peer pairing, member directory, station behaviour.*

---

## 2. Piazza (homepage)

**Feeling:** "I'm arriving at my business today," not "I've opened an app." Calm, not overwhelming.

**Confirmed from the mockup:** "Buongiorno, [name]" greeting + date, tagline, hours-reclaimed counter, "Continue your journey" card (current station + roadmap phase), this week's log status (with a FATTO stamp on completion), today's priorities checklist, upcoming hot seat with add-to-calendar, current peer partner with a message shortcut, current challenge, a mini La Strada map with a link to the full view.

### The proof cluster
Personal hours-reclaimed counter, the milestone path, and the collective community goal are **one cluster, not three separate widgets** — milestones are just thresholds of the same personal number, so they sit directly together:
- Personal hours reclaimed — the big number
- Milestone progress — compact on Piazza: current position + distance to next unlock as a single line (e.g. "62 hrs · 38 to your next unlock"), click-through to the full illustrated path view
- Collective community goal — same big-number treatment, smaller, placed right alongside

### Hours reclaimed — the actual definition
Flagged during Step 4 as never having one, despite being the product's headline metric. Fully resolved now:

- **Generated per handover pack entry, as a weekly rate** (e.g. "saves 5 hrs/week"), not a one-off figure.
- **Estimated at hot seat prep, from the member's own tracked category hours** — same "AI drafts, Nina confirms" moment as the write-up itself, not a member self-report. Claude reasons from the relevant category's logged hours (and any notes on those entries) to draft a plausible weekly-hours-saved figure; Nina confirms or adjusts before it's locked.
- **Recurring and stacking.** Every active build's weekly rate adds to a running total — a member with two live automations at 5 and 3 hrs/week is reclaiming 8 hrs every week they submit their log, on top of whatever's already banked from earlier builds. This is the "distance travelled" mechanic from Officina Vespa's concept, taken literally: distance accumulates from every trip, not just the most recent one.
- **Accrual is gated on submission.** The running total only grows for weeks the member actually submits their log — reinforcing the same weekly habit the draw already incentivises, not a separate parallel mechanic.
- **Milestones stay 50 / 100 / 250 / 500 as real thresholds**, not placeholder numbers. Roughly paced so a member with 2-3 active builds hits their first milestone within about two months, and reaches 500 only after genuinely sustained membership.
- **Schema addition:** an optional `notes` field on individual time entries — not required, so it never adds friction to daily logging — giving the AI-prep step something concrete to spot recurring patterns from when estimating a build's likely hours-saved rate. **As built (Step 5):** the `note` column already existed for manual entries; the timer itself gained two optional entry points — on the start form (skippable, sits below the required category) and as a disclosure on each logged entry afterward (the more useful of the two, since what an hour turned into is only known once it's over). The daily motion stays "pick category, press Start" either way.

**Fully resolved (Step 10 spec):**
- **Qualifying week = the same 10-hour threshold as draw eligibility.** One bar, one meaning — a member either showed up that week or didn't, and both the draw and the accrual read the same signal. Two different definitions of "showed up" in the same product would be needless complexity and confusing to explain.
- **Multiple active builds stack, not replace.** A member with two live automations at 5 and 3 hrs/week reclaims 8 hrs every qualifying week — sum the active rates, multiply by qualifying weeks.
- **Rates are revisable, but already-accrued hours never retroactively shrink.** Built as a dated rate history per handover pack entry (`effective_from` / `effective_until`), not a single mutable field — retiring a build or correcting an estimate closes the old period and opens a new one, rather than overwriting history. The running total itself is an append-only weekly ledger (same pattern as `member_status_events` and `roadmap_history`), not a live recalculation — each qualifying week writes a discrete entry using whatever rate was in effect that week.
- **Retiring a build's rate is a natural extension of the two-week check-in**, not a new workflow — that's already the moment "what worked, what didn't" gets captured, and the obvious trigger for Nina to notice a build's stopped running.

### The monthly draw
A compact card: entry status, this month's prize, the draw date. Click-through opens the full raffle-ticket view. Not shown fully expanded on the homepage — same "compact + click-through" pattern as milestones.

### "Continue your journey" — logic, not just a label
This can't mean "next station in a fixed sequence," because members dip into stations based on their roadmap's current focus, not a start-to-finish order. It needs to be **driven by the same diagnostic logic as the roadmap itself** — "the station matching your current focus," which may jump around the map rather than progress linearly. This directly shapes how La Strada needs to represent completed/current/upcoming — by roadmap phase, not by station position on the map.

---
*Sections to come: La Strada, weekly log, hot seat, training library, handover pack, peer pairing, member directory, station behaviour.*

---

## 3. La Strada

**vs. Piazza — the distinction to hold onto throughout this section:** Piazza is *today* — a daily-changing snapshot of what's due, what's happening now, the proof numbers. La Strada is *the whole journey* — structural, only really moves once a month at re-pointing. Piazza answers "what do I do today?"; La Strada answers "where am I in the bigger picture?" Piazza should only ever show a small preview of the map, never the full thing, so La Strada stays a place members *visit* rather than something they're routed through on every login.

### Entry points — two paths in, not one
- **"Continue your journey" (Piazza)** — a deep link, not a map link. Skips the map entirely and drops the member straight into whichever station matches their current roadmap focus.
- **The mini-map widget (Piazza)** — opens the full, zoomed-out La Strada view instead of jumping anywhere. For members who want to dip into something themselves rather than follow the pointer.
- **The sidebar's "La Strada" link** — always available regardless of where someone is in the product, not just reachable via Piazza's preview.

**The loop always closes:** every station has a "return to La Strada" back to the full map; the sidebar always returns to Piazza. Nobody gets stuck inside a station.

### Confirmed contents
- Hours reclaimed to date
- Monthly plan
- **This month's focus station** (the place) — kept distinct from **their current challenge** (the specific named thing being built, e.g. "automate your enquiry follow-up"). Two pieces of information, not merged into one.

**How the confirmed challenge gets set:** not written up by Nina during or after the call, and not left purely to the member's own edit — locked during the existing pre-call AI-prep review, since that moment already exists and costs nothing extra.
1. Member pre-submits their own version of the challenge
2. Claude drafts a suggested build direction from their data
3. Nina reviews and confirms or adjusts it as part of that same prep pass — one more glance, not a new task
4. That becomes the locked challenge going into the hot seat, and what displays on Piazza afterward
5. The live slot is spent building it, not writing it up — protects the 5-minutes-a-person, zero-buffer capacity already flagged for the hot seat

**Exception, not the default:** if the live conversation genuinely shifts direction, a quick edit afterward is fine — rare case, not the designed mechanic.

**Schema:** challenge field gets `confirmed_at` and `confirmed_by` (Claude-drafted vs Nina-adjusted), set during prep.
- Next hot seat session
- Next Telegram day
- Their buddy for the month
- **Daily time tracking shortcut** — a start/stop timer against specific task categories, forked from the existing Allegro Portal's floating global timer. Live, real-time logging throughout the day, not a retrospective weekly guess. Full mechanic and schema to be detailed in the Weekly Log section next; Piazza just needs the shortcut + today's logged time at a glance.
- **Monthly draw** — compact card, click-through to full raffle-ticket view
- **Collective community goal** — sits beside the personal hours-reclaimed counter, same big-number treatment

### La Strada — free-roam, not guided
Confirmed: after onboarding, La Strada is the full map, navigated entirely by the member's own choice — not routed by "current focus," which lives on Piazza instead. This simplifies the map's logic considerably: just **visited / not visited**, no complex current-phase routing needed.

**Access vs. relevance — two different things, not one:**
- **Access:** once `status = active`, every station is walkable, full stop. No station is ever locked for business-model reasons. Free-roam access to the full map is itself gated to active status (onboarding members don't have a roadmap yet, so nothing to freely browse).
- **Relevance:** business-model tagging still matters for what the *recommendation engine* surfaces (e.g. Piazza's "this month's focus," the library's suggested content) — a digital-only founder shouldn't be pushed retreat coordination as their focus, even though they could freely visit that station if they wanted to.

### Where the roadmap lives, and how it's bespoke without being bespoke-built
**Lives in the database as structured data, not as a document or generated file.** `roadmap` table (phases + `current_focus`, sketched in Onboarding), plus a `roadmap_history` table logging each month's re-point so movement over time is visible.

**One shared template, not one build per person.** La Strada's screen — map, stations, visual structure — is identical code for every member. What makes it feel personal is that on load, that one template pulls the logged-in member's own row and renders their own phases and progress onto it. Same shell, different data, every person — nothing gets "pushed" or regenerated per member, which matters because a genuinely per-person file would mean real manual work every single month, for every member, at exactly the point this build has tried to avoid that everywhere else.

**Generation logic, same "AI drafts, Nina confirms" pattern used throughout this brief:**
- **Initial roadmap** (week 4, from the 1:1) — Claude drafts a suggested phase structure from the audit data, Nina reviews and confirms via the admin panel
- **Monthly re-point** — manual first (using actions-taken data to decide if focus shifts), AI-assisted version sits in Phase 2 once proven

### Mobile
Confirmed: a fully functional, dedicated version of both Piazza and La Strada on mobile — not a simplified fallback. Flagging for the project plan: this is a meaningfully larger build than a single responsive pass, given proper pan/zoom touch interaction on the map. Worth sizing accordingly when timelines get set.

---

## 4. Weekly log

### The core shape — one submission, three jobs
- **Time tracking** — daily start/stop timer, forked from the existing Allegro Portal's floating global timer, run against fixed categories in real time
- **Roadmap actions-taken** — a checklist against specific roadmap items, plus a free-response box for anything else that happened outside the plan
- **The monthly challenge** — confirmed during Nina's hot seat prep review, not edited here (see Piazza/La Strada section)

**Framing:** a dated log entry — a ship's log — not a generic form.

**During onboarding (weeks 2-3):** time tracking only. No roadmap yet for actions-taken to reference.

### Time tracking categories
Fixed set, mapped to the V/L/S/P system so the diagnostic and the library stay consistent:

| Category | Bucket | Station | Note |
|---|---|---|---|
| Client Sessions | Systems & Delivery | *(no station — see relational check below)* | Relational check vs. pricing/revenue, not a simple hours threshold |
| Group Client Sessions | Systems & Delivery | *(no station — see relational check below)* | Same — relational check |
| Finance admin | Profit | Banco Allegro | |
| Course / Client Admin | Systems & Delivery | Studio dell'Architetto | |
| Strategy / New offers | Profit | **La Boutique** | Resolved — "new offers" is the actionable part, matches La Boutique directly |
| Looking at data | Profit | Banco Allegro | |
| Sales calls | Profit | **Piazza Caffè** | Sales conversations fit the "conversations" theme better than the ledger theme of Banco |
| Ads / Marketing | Visibility | Cinema Allegro | |
| Social Media | Visibility | Cinema Allegro | |
| Other Admin Tasks | Systems & Delivery | Studio dell'Architetto | Catch-all |

**Note on delivery categories:** Client Sessions and Group Client Sessions don't map to a station directly, because when the pricing/leverage flag fires, it points to **La Boutique** (repricing, packaging, building leverage) rather than to a "delivery" station that doesn't exist — the flag itself is the routing, not a category-to-station lookup.

**Important — corrected:** Client Sessions and Group Client Sessions aren't excluded from diagnostic logic, but they don't use the same simple "too many hours" threshold the other categories use, because high delivery hours can be completely healthy. Instead, they get a **relational check**: delivery hours measured against pricing/revenue data from the business snapshot. High delivery hours + low revenue-per-hour surfaces as a **pricing/leverage flag** (pointing toward Profit-bucket work — repricing, packaging, building a group offer), not a Systems fix. High delivery hours with healthy numbers behind them stays unflagged. Same pattern Nina and Crystal diagnosed in her own retainer clients, now pointed at members' businesses.

**Dependency — resolved:** the onboarding audit's business snapshot needs to capture current pricing/rates specifically, not just general revenue — the flag can't work without a number to compare delivery hours against. Confirmed this question is being added when the audit questions are drafted (see Onboarding section).

### Completed week
**10 hours logged** = a completed week. This is the threshold for monthly draw eligibility (resolves "what counts as a full month of logs" from the gamification design).

**As built (Step 1, verified):** weekly totals are a live view, not a stored column — since this number gates real draw eligibility, it's recalculated from the actual time entries every time rather than maintained as a separate figure that could quietly drift out of sync with them.

### Reminders
Light touch, not daily:
- **Mid-week** — a nudge only if meaningfully behind pace for the 10-hour threshold
- **End of week** — only if still short, framed around what's at stake (e.g. "2 hours off this week's log — still time to stay in the draw")

No daily "did you log today" ping — avoids noise, matches the calm tone set everywhere else in this build.

### The Friday/Monday touchpoint (new, confirmed)
A lighter, more frequent check-in than the monthly hot seat or the 2-week check-in — for help with whatever a member's stuck on with their "one thing" (the build in progress, separate from their independent roadmap work).

- **Friday:** member submits a question via the existing "Anything else this week" free-text box on the weekly log — no new form needed
- **Monday, before 9am:** Nina responds — live in portal chat, during the existing one-hour Monday window (the same slot already speced as the boundaried strategy chat), not a separate queue
- **Resolved:** portal chat needs to support voice messages, not just text. Real feature requirement for Step 11, not a nice-to-have — recording, sending, and playback of audio messages within chat.

### Roadmap vs. "the one thing" — a real distinction, not the same content
Two genuinely separate tracks, easy to conflate:
- **The roadmap** (phases, trainings) — based on stated goals at the 1:1, self-paced, independent work
- **"The one thing"** (the monthly automation/process) — based on real tracked time data, built together with Nina at the hot seat

**Resolved:** "Current focus" is about the hot seat build specifically, not the roadmap generally. It becomes **read-only on the roadmap editor**, populated only through the hot seat's own prep-and-confirm process (Claude drafts from tracked data, Nina confirms) — not typed directly during the 1:1. **Needs a defined empty state** for active members who haven't had their first hot seat yet — something honest like "Your first hot seat hasn't happened yet," matching the same pattern already used elsewhere (e.g. the pre-roadmap placeholder on the itinerary), not a blank or broken-looking field.

---

## 5. Hot seat

### Format & capacity
- Fixed monthly group slot, not bookable or personalised — whoever shows up gets worked on live
- **5 minutes is a guaranteed minimum per person, not a fixed slot** — if fewer than 12 attend, leftover time in the hour distributes as bonus time to whoever's there. This also softens the original zero-buffer risk, since most sessions likely won't hit the full 12.
- Once attendance exceeds 12, the group splits into pods — **deferred, not yet decided.** Same underlying principle as the in-person events (small enough for real attention), specifics to be settled later.

### Onboarding timing, clarified
No cohort structure in the sense of batching people through a shared countdown — time tracking and onboarding activity can start the moment someone joins, whenever that is (per the early-tracking rule already locked). What *is* fixed and shared is the hot seat itself — one group, one calendar slot, everyone in it together.

**A new member's readiness for their first hot seat is a judgement call made live during their 1:1 and roadmap call — not an algorithmic rule.** Nina decides in that conversation whether they're ready to join the very next hot seat or need to wait, rather than the system enforcing it automatically.

### Pre-submission → AI prep → confirm
- Their tracked time data for the month (automatic, no form needed)
- Their own challenge statement, in their words
- "What have you already tried?"
- "What would 'done' look like for you this session?" — scopes the ask to something buildable in the time available
- Auto-pulled: their handover pack (nothing suggested twice) and their La Strada position (suggestion stays aligned to their roadmap)

Claude drafts a specific, scoped suggestion from all of the above. Nina confirms or adjusts it during her existing pre-call review — not live. That becomes the locked challenge going into the session and what displays on Piazza afterward (full mechanic detailed in the Piazza/La Strada section).

### Reminders — two tracks
- **Submission:** 7 days out; 2 days before deadline (non-submitters only); day-of final nudge, framed as an incentive ("after this, still welcome, but built live without prep")
- **Attendance:** day before; morning of
- **Fallback if nobody submits:** defaults to whatever their tracked data shows as the biggest time-block

### The call itself
**Zoom.** Nina provides the link. Replays are captured via Zoom recording, then **clipped down afterward as a real production step** — not automatic — worth remembering when the replay-archive/library section comes up.

### Expectation-setting
At a few minutes a head, "live build" realistically means confirming the AI-drafted direction and adding expert judgement live, not building from a blank page. Worth being explicit about that distinction with members so the promise matches what actually happens in the room.

---

## 6. Training library

**Full content list and category groupings live in the separate `Training_Library_Grouping.md` document** — this section covers how the library *behaves*, not the full content inventory.

### Structure
**Organised by station, not by abstract bucket.** Every training lives in exactly one station (see `Training_Library_Grouping.md` for the full station-by-station breakdown). The V/L/S/P bucket and sub-category are kept as secondary tags — same taxonomy as the website quiz and the weekly log's time-tracking categories, so the diagnostic language stays consistent — but the actual organising and browsing principle a member experiences is the station itself.

### Tagging, two layers
- **Topic** — which bucket + sub-category
- **Job** — save-time vs make-money, feeds the diagnostic recommendation engine directly

### Access
- **Onboarding:** a small universal starter set only (not diagnostic-matched, since there's no diagnosis yet) + a handful of hand-picked trailer replays
- **Active:** the full, diagnostic-matched library unlocks

### "Recommended for you" — lives on Piazza, not inside the library
Resolves the earlier open question: this isn't a special filtered view inside the library itself, it's a Piazza card linking out to specific trainings relevant to the member's current roadmap focus. The library itself stays fully browsable, free-roam, same as La Strada.

### Replays — marked distinctly from formal trainings
Not a unified list. Real hot seat builds (clipped from Zoom recordings — a manual production step, not automatic) need visually distinct treatment from the pre-recorded formal library content, so members can tell "someone's actual live build" apart from "structured lesson."

### Hot-seat-buildable subset
A subset of trainings represent a real artifact getting built (marked ★ in the grouping doc) rather than pure theory — these double as the menu for what's likely to come up as a live build, distinct from "watch and understand" content.

### Content formats
Library content isn't all video — some is PDF, some audio, some a spreadsheet. Needs a `content_type` field, shown as a visible icon/badge before someone clicks in, so nobody opens something expecting one format and gets another.

### Weekly Nina audio drop
A short, low-production audio recording from Nina, once a week, on something ops-related. Available to **everyone**, not tiered by Partner vs standard.

- **Format:** deliberately unscripted and quick to record, so a standing weekly commitment doesn't become its own production burden
- **Home:** lives inside **Cinema Allegro** (the visibility/content station) as a recurring segment — not a new station, a third content type alongside formal trainings and hot seat replays in the same room
- **Why:** low-cost way to keep Nina's actual voice present weekly without live time cost, gives members a reason to open the portal beyond the required log, and doubles as raw material for repurposing into social content later

---

## 7. Admin

Cross-cutting — not tied to one member-facing function, but touches several already covered in this brief.

**Confirmed need:**
- **Content upload/management for the library** — add training content with the full tagging set (topic bucket, sub-category, save-time/make-money, content_type, ★ hot-seat-buildable flag)
- **The weekly Nina audio drop** — a simple upload point

**Resolved: all admin functions live in one unified panel** — content upload, hot seat challenge review/confirmation, running the monthly draw, and general member/roadmap visibility, alongside onboarding audit data. One panel, one login, not separated out.

**New requirement, resolved alongside the payment decision:** admin needs to **manually create a new member record**, not just view existing ones — this is how onboarding actually starts. No payment webhook exists; Nina/team create the record themselves once both payment and the signed contract are confirmed. This should set `join_date` and kick off the onboarding sequence from Section 1.

**Technical:** fork the existing `is_portal_admin()` RLS pattern already working in Allegro Portal — not a new access system.

---

## 8. Handover pack

### Studio vs Archivio — resolved, genuinely different sources, not two views of one dataset
- **Studio dell'Architetto** — training content about systems and processes generally. Part of the library (Systems & Delivery bucket content lives here visually).
- **Archivio** — the member's own projects, what they've actually built each month. This is the handover pack proper — personal, specific, auto-compiled from hot seat builds.

### Write-up and manual additions — both resolved
1. **Auto-generated vs written up — resolved.** Nina drafts with AI assistance after the call, submits to the member's portal. Member can edit their own copy (rephrasing in their own words). Nina provides general instructions plus names it. Same "AI drafts, human confirms" pattern as hot seat prep, just applied to write-up.
2. **Manual additions — resolved.** Members can add their own SOPs.

### The AI SOP generator (new)
Structured Q&A (goal, steps, tools, who's responsible) feeding a single Claude API call that writes up a clean SOP — same "AI drafts, member reviews" shape as hot seat prep. Genuinely small to build: a form, one API call, a review step. Worth building this version rather than a plain fill-in-yourself template, given the "wow, what else can Nina do with AI" moment it creates.

**Resolved:** a downloadable Word doc, styled cleanly — not a live file in the member's own Google Drive. No OAuth integration needed, meaningfully simpler build.

---

## 9. Peer pairing

### The mechanic
- Monthly, 1:1, mutual — both bring a challenge, both give and receive, roughly 15 minutes each way
- Matched by **rotation, not skill or business type** — deliberately, so nobody's ever "the one who's never picked." Business-model/team-size data from onboarding is explicitly kept out of matching, to avoid quietly reintroducing hierarchy.
- **Fully unstructured conversation** — no prompts or agenda imposed

### Scheduling flow
1. Availability submission — a monthly task, folded into the same rhythm as the rest of onboarding/tracking, not a separate ask
2. System matches by rotation + overlapping availability
3. Both members get a "you're booked in" notification with the confirmed time
4. **They reach out to each other directly to arrange the actual call** (Zoom, phone, whatever suits them) — the platform doesn't generate a call link for this, unlike the Nina-hosted hot seat. Deliberately lightweight.
5. ~2-week deadline to actually meet; if unconfirmed by day 7, a flag goes to **Nina** (not the pair), so a stalled pairing doesn't silently never happen
6. Met/not-met tracked over time as signal, not shame

### Boundary
Connection, not paid work — if two members want to work together commercially afterward, that's between them, not something the platform brokers.

### Eligibility timing
First eligible pairing month is the **same month as a member's first hot seat** — consistent cadence, no separate waiting period.

### Odd numbers — unpaired member gets Nina that month
Self-limiting (only happens when the rotation lands oddly, not a standing commitment). **Resolved: stays genuinely mutual** — Nina also floats something of her own, gets input back, same shape as any other pairing. No special "bonus mentoring session" exception for this case.

**As built (Step 1, verified):** a `pairing_participants` table, not fixed `member_a`/`member_b` columns — two columns can't cleanly enforce "one pairing per member per month" (someone could be slotted into either column across different rows). This structure also means the odd-numbers case is just an ordinary row with Nina as a participant, not special-case logic — the schema itself enforces the "genuinely mutual, same shape as any pairing" decision above, rather than that just being an intention.

---

## 10. Member directory

### Placement — resolved
**Piazza Sociale**, not Club Allegro. Reasoning: this is a searchable utility, not a destination — search/filter is tool behaviour, and burying it inside a themed station adds friction without adding feeling. Club Allegro stays purely for the Membership Design training content it was actually built for.

### Listing contents
Name, Title, Bio, Headshot, Links to their offers.

**Built via a dedicated prompt, not auto-pulled from onboarding answers.** Field copy: *"What would you like your Member Directory info to say about you? Please provide a short bio and description of the key ways to work with you with links — along with a photo of you."*

### Required onboarding step
Filling in the directory listing is now a **required onboarding task**, not optional-whenever. Cross-reference: needs adding to the onboarding checklist/sequence (Section 1) alongside the welcome session and audit form.

### Connection
A chat button opens a direct DM in portal chat, or the member clicks straight through to their listed links.

### Search
Free-text search across name, title, and bio only — no category/dropdown filters. Keeps the business-model-type data from onboarding entirely out of the directory (it stays used only for the recommendation engine, and deliberately excluded from pairing, per earlier sections).

---

## 11. Station behaviour

### The shared skeleton
Every station follows the same underlying layout regardless of theme: where you are, why this matters, current priority, recommended training, build/action, progress, return to La Strada. The theme changes, the skeleton never does.

### Access
Free-roam once active — every station is walkable, no business-model locking (resolved in the La Strada section).

### Per-station resolutions
- **Grand Hotel Riposo** — onboarding & audit, as originally conceived
- **Studio dell'Architetto** — systems/process training content
- **Officina Vespa** — automation, confirmed as originally conceived (automations as engine parts, hours saved as distance travelled)
- **Cinema Allegro** — Visibility trainings, hot seat replays, and the weekly Nina audio drop as a third content type in the same room
- **Piazza Caffè** — Leads & Nurture training content only. Availability submission stays in the weekly log where it already lives, not duplicated here, to protect the "one motion, multiple jobs" principle used throughout this build. Optional nice-to-have: display who the member's buddy is this month, even though submission itself happens elsewhere.
- **La Boutique** — Offers & Pricing, as originally conceived
- **Banco Allegro** — Data & Money, as originally conceived
- **Stazione Centrale** — Launches, as originally conceived
- **Terrazza, Club Allegro** — confirmed as originally conceived (Membership Design training content)
- **Piazza Sociale** — chat (general, wins, time-tracking discussion) and the member directory both live here, since both are utilities reached for constantly rather than destinations arrived at
- **Archivio** — the member's own project archive, the handover pack proper

### Export rules
- **SOPs (manual or AI-generated) are the only exportable content in the whole product.**
- **All formal training content stays non-exportable** — video streams (no download link exposed), PDFs render in an embedded viewer with no download button, audio streams rather than downloads. Standard "soft" protection, same approach as Kajabi/Teachable — not airtight against screenshots or screen recording, but that's an accepted industry limit, not a gap to over-engineer around.
