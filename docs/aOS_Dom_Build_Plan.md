# aOS — Dom's build plan
*Reference documents: `aOS_Claude_Code_Build_Brief.md` (full feature spec, function by function) and `Training_Library_Grouping.md` (content and station mapping). This document is the sequence — those two are the detail.*

**Ground rule confirmed by Nina: build the full experience from day one** — all stations skinned, metro map live, not a phased "core first, town later" rollout. The steps below are still ordered by technical dependency (you can't build the hot seat before there's a database), not by what members see first.

**Mobile and desktop are both fully functional from the first line of code** — this isn't a step, it's a constraint running through every step below.

---

## How to actually use this document
This isn't something to read once and execute solo. For each step below, open Claude Code in the project folder, tell it which step you're on, point it at the relevant section of the Build Brief, and let it walk you through building that specific piece — ask it plain questions whenever something's unfamiliar, exactly like any conversation. This document is your table of contents, not a script.

## Step 0 — Infrastructure setup (today, before any feature code)

**Manual, in a browser — nobody codes this, you just click through it:**
1. **Supabase** — go to supabase.com, log in, click "New Project." Name it `aos-portal`. Set a strong database password and save it somewhere safe. Pick a region. Create it, wait a couple of minutes while it provisions.
2. **Get the credentials** — inside the new project: Settings (gear icon) → API. Copy three things: the **Project URL**, the **`anon public` key**, and the **`service_role` key**. That last one is especially sensitive — never let it end up anywhere that gets committed to git.
3. **GitHub** — new **private** repo, e.g. `allegrostrategia/aos-portal`, matching the existing `allegro-portal` naming.
4. **Vercel** — log in, "Add New Project," import that repo, deploy. It'll be blank at first — expected and fine.
5. **DNS** — in Vercel's project settings, add `aos.allegrostrategia.com`. Vercel shows you a record to add; go to wherever allegrostrategia.com's DNS is actually managed and add it there.
6. **Get real access to the existing Allegro Portal repo** — not just knowing it exists. Ask Nina for actual access, or for her to export the relevant SQL for `get_my_role()` and `is_portal_admin()`, before trying to fork anything from it.

**Now open the project folder in VS Code, open Claude Code, and this becomes a conversation:**
7. Tell Claude Code: *"Set up a new project in this folder, install the Supabase client library, and create a `.env.local` file for my Supabase credentials — make sure it's in `.gitignore` and never gets committed."* Let it scaffold this.
8. Paste the real Supabase URL and keys in when it asks.
9. Create the `CLAUDE.md` file (provided separately) at the project root — this is what Claude Code reads automatically every time it opens this folder, so the project's core rules don't need re-explaining every session.
10. **Payment status — resolved.** Manual only, not a webhook. Nina/team manually create the member record via the admin panel once both payment *and* the signed contract are in place — payment alone was never going to be enough to grant access, since the contract step happens regardless. No HeyClients/Stripe webhook integration needed.
11. **Assets** — station images, coastline art, and the aOS mark are done; get them into the repo's asset folders now
12. **Fonts** — Cormorant Garamond, Inter, JetBrains Mono via Google Fonts

From Step 1 onward, every step follows the same pattern as #7: describe what's being built, reference the relevant Build Brief section, let Claude Code do the work, review it.

---

## Step 1 — Database schema and auth

**Schema: done.** Ten migrations in `supabase/migrations/`, 39 schema tests passing (`npm run test:db`), 51 RLS policies, every table with RLS enabled. Still to run against the real Supabase project.

- ✅ `members` + `member_status_events` — `create_member()` / `cancel_member()` / `rejoin_member()`, the `has_portal_access()` gate, contract term and recommit fields
- ✅ `stations` + `time_categories` — seeded reference data: the eleven stations, the fixed ten time categories with their bucket and station mapping
- ✅ `member_audits` — repeatable, `occasion` = onboarding | recommit
- ✅ `roadmap` + `roadmap_history` — `reason` = onboarding | monthly_repoint | recommit, history logged by trigger
- ✅ `time_entries` + `weekly_submissions` + `weekly_time_totals` view — live start/stop timer, 10 hours = a complete week
- ✅ `training_content` — station, bucket, job tag, kind, format, ★ flag, onboarding starter set
- ✅ `handover_pack` — gated on `has_portal_access()`, never `status = 'active'`
- ✅ `draws` + `draw_entries` — with `complete_weeks_in_month()` for eligibility
- ✅ `pairings` + `pairing_participants` + `pairing_availability` — one pairing per member per month, enforced
- ✅ `member_profiles` — the directory, full-text searchable on name/title/bio only

**Auth: done and confirmed live.** Login, password reset, the invitation landing route and route protection are deployed at `aos.allegrostrategia.com` and a real sign-in reaches Piazza. Admin rows seeded.

**Still to do in Step 1:**
- **Test the invitation flow end to end** — the only auth path never exercised, and the one onboarding depends on. Needs the Supabase email templates repointed at `/auth/confirm` first (README → Auth); the defaults will look like they work and then drop people back at the login screen
- Set minimum password length to 8 in Supabase, to match what the form promises
- Swap the placeholder `get_my_role()` / `is_portal_admin()` bodies for Nina's real Allegro Portal SQL
- Hot seat tables (Step 6) — the monthly challenge belongs there, deliberately not on `weekly_submissions`
- Chat tables (Step 11)

*Full field-level detail for each: Build Brief, Sections 1, 4, 6, 8.*

## Step 2 — Design system

CSS variables for the full palette (navy, orange, gold, sky, blush, off-white), the three-font type stack, base component library. Get this right before building screens — it's the foundation every station and every screen sits on.

## Step 3 — Onboarding

Welcome session (video + `watched_at` gate) → audit form → weekly time tracking timer (forked from the existing global timer) → onboarding access tiers (open vs locked content) → itinerary → required member directory listing.

*Full detail: Build Brief, Section 1. Note: the actual audit questions are still Nina's to deliver — build the form mechanism now, swap in real copy when it lands.*

## Step 4 — Piazza and La Strada

Piazza dashboard with all confirmed widgets (hours reclaimed, monthly plan, focus station + challenge, next hot seat, Telegram day, buddy, timer shortcut, draw card, community goal). La Strada as the full metro-map SVG, free-roam navigation, visited/not-visited state.

*Full detail: Build Brief, Sections 2–3.*

## Step 5 — Weekly log

Timer against the ten fixed categories, roadmap actions-taken checklist + free text, reminder cadence.

*Full detail: Build Brief, Section 4.*

## Step 6 — Hot seat

Submission form, Claude API integration for AI-drafted build suggestions, Nina's confirm-during-prep workflow, Zoom link, reminder tracks.

*Full detail: Build Brief, Section 5. Pod-splitting logic past 12 attendees is still undecided — build for a single group for now, this can be added later without disrupting anything else.*

## Step 7 — Training library and stations

Content upload/tagging in admin, the shared station template, each station skinned with its image, content-type badges, non-exportable protection on formal content (streaming/embedded viewer, no download links), replay uploads marked distinctly, the weekly Nina audio drop in Cinema Allegro.

*Full detail: Build Brief, Section 6; full content and station mapping in `Training_Library_Grouping.md`.*

## Step 8 — Admin panel

One unified panel: content management, onboarding audit visibility, hot seat challenge review, running the monthly draw, general member/roadmap visibility.

**Plus "create new member" — not just viewing existing ones.** Since member creation is manual (Step 0 #10), this form is the actual onboarding trigger: confirm payment and signed contract, invite the email address, create the record, sequence starts. Worth building this ahead of the rest of the panel — nobody can be onboarded without it, so it blocks any real end-to-end test of Step 3.

*Full detail: Build Brief, Section 7.*

## Step 9 — Handover pack and the AI SOP generator

Auto-compile from hot seat builds, manual SOP addition, the AI-assisted SOP generator (structured Q&A → Claude API → Word doc export), export rules (SOPs only, everything else stays locked).

*Full detail: Build Brief, Section 8.*

## Step 10 — Gamification

Personal hours-reclaimed counter, milestone path, monthly draw mechanics, collective community goal.

*Full detail: scattered across Piazza/Weekly Log sections of the Build Brief — the gamification mockups earlier in this project are the visual reference.*

## Step 11 — Peer pairing, chat, member directory

Availability submission (folded into the weekly rhythm), rotation matching, the day-7 flag to Nina, portal chat in Piazza Sociale (general, wins, time-tracking discussion, DMs — this is also "Telegram day"), the member directory (searchable by name/title/bio).

*Full detail: Build Brief, Sections 9–10.*

## Step 12 — The roadmap reveal document generator

An internal tool for Nina: input from the audit + call notes → Claude drafts the reveal HTML → Nina reviews and sends. Not member-facing — this is a Nina/admin tool.

*Reference: `Sample_aOS_Roadmap_Reveal.html` for the target output.*

## Step 13 — Polish, once everything above is working

Vespa intro video integration (first login only, skippable), any of the optional animation flourishes (flip-board counters, the FATTO stamp, self-drawing blueprints) — all independently droppable, add what time allows without holding up anything else.

---

## Standing rules across every step
- Mobile and desktop both fully functional, not a fallback — check this at every step, not as a final pass
- "AI drafts, Nina confirms" is the pattern for anything AI-touched (hot seat prep, SOP generation, roadmap re-pointing, the reveal document) — never full automation without a human confirm step
- Every training lives in exactly one station — that's the actual content organisation, the V/L/S/P bucket is a secondary tag only
