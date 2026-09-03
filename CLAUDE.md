# aOS — project context for Claude Code

This file is read automatically every time Claude Code opens this project. It holds the rules that apply everywhere — for full detail on any specific feature, ask to be pointed to the right section of `aOS_Claude_Code_Build_Brief.md` or `Training_Library_Grouping.md`, both in the `/docs` folder of this repo.

## What this is
aOS (Allegro Operating System) — a membership portal for ambitious, service-based founders, under the parent brand Allegro Strategia. Core promise: every month, one real thing costing time or money gets built live, based on real tracked data.

## Standing rules — apply to every feature, not just where mentioned
1. **Mobile and desktop are both fully functional, always.** Not a responsive pass at the end — build every screen with both from the start.
2. **No AI runs inside the app. Anywhere.** Claude is a tool Nina uses *outside* the product — she works a roadmap out with it, or drafts the reveal document, then types or pastes the result in. Nothing in aOS calls an AI API and **`ANTHROPIC_API_KEY` is never needed**. Settled 3 September 2026 as a final answer, covering all four places it was once planned: hot seat prep (Nina reads the raw evidence — their words, their tracked hours — and confirms manually), the initial roadmap (a dedicated admin Roadmaps section she types into), the SOP tool (a member-facing template they fill in themselves, not a generator), and the roadmap reveal document (drafted externally, sent by Nina). The human checkpoint the old rule protected is still there; it's now the whole mechanism rather than a step after a draft. **If a feature seems to want AI, the answer is a screen where a person puts in what they decided.**
3. **Every training lives in exactly one station.** The station is the organising principle; the V/L/S/P bucket (Visibility/Launch/Systems & Delivery/Profit) is a secondary tag only, used for the recommendation engine, not for browsing structure.
4. **One shared template, live data-binding — never generate or push per-user files.** La Strada, Piazza, and every station are identical code for every member; what's personal is the data pulled in in on load, not the file itself.
5. **Protect Nina's time everywhere.** The hot seat is a fixed group slot, not bookable 1:1. Peer pairing is mutual and rotation-matched, not smart-matched. The AI-prep pattern exists specifically so nothing requires Nina's live judgement to scale linearly with member count.
6. **Nothing is ever deleted.** Member status is `onboarding | active | cancelled`; cancelling revokes access and keeps every record intact. So every table holding member content needs `public.has_portal_access()` in its RLS alongside the ownership check — that's the single gate cancellation works through. Rejoining is full onboarding again from scratch, same row, never instant reactivation.

## Brand system
- **Colours:** navy `#073C8C`, orange `#FF6625`, gold `#FFD551`, sky `#A4D3EB`, blush `#FFB29E`, lemon cream `#F8E6A0`, off-white `#F3F5FD`
- **Type:** Cormorant Garamond (display/headings, often italic), Inter (body/UI), JetBrains Mono (numbers and data — hours reclaimed, revenue, dates)

## The eleven stations
Grand Hotel Riposo (onboarding/audit), Studio dell'Architetto (Systems & Delivery), Officina Vespa (Automation), Cinema Allegro (Visibility), Piazza Caffè (Leads & Nurture), La Boutique (Offers & Pricing), Banco Allegro (Data & Money), Stazione Centrale (Launches), Terrazza (In-Person & Events), Club Allegro (Membership Design), Archivio (the member's own project archive — not formal training content).

Plus two non-station areas: **Piazza** (daily homepage) and **Piazza Sociale** (chat + member directory).

## Tech stack and conventions
- Next.js 16 (App Router, TypeScript, `src/` directory) + Tailwind v4 — read `AGENTS.md`, Next 16 has real breaking changes vs. older versions
- Supabase (own project, separate from the existing Allegro Portal's)
- RLS forked from the existing Allegro Portal patterns: `get_my_role()`, `is_portal_admin()` — ask Nina for access to that repo before assuming these exist here
- Vercel deployment, `aos.allegrostrategia.com`
- **No payment integration.** Members are created manually by Nina/the team in the admin panel, once payment *and* the signed contract are both confirmed. No webhook, no self-signup — creating the member record is what starts the onboarding sequence
- **6-month minimum term, then rolling monthly.** Enforced by the signed contract and HeyClients billing, never by the app. At the 6-month mark (`contract_term_end_date`) the member gets a fresh 6-month roadmap as a recommit incentive — refreshed audit, then a live 1:1 with Nina, same shape as the original onboarding call. Which means **the audit is repeatable, not one-time**, and `roadmap_history` must distinguish a recommit re-point from the routine monthly one

## Running it locally
- Node lives at `~/.local/nodejs` (symlinked into `~/.local/bin`) — `npm run dev`, `npm run build`, `npm run lint`
- **`npm run test:db` runs every migration against an in-process Postgres and tests the RLS policies as real members. Run it after any schema change, and always before `npm run db:push`** — no Docker or Supabase project needed
- Supabase CLI is a devDependency, so use `npx supabase …` or the `db:*` scripts — there's no global install
- Credentials go in `.env.local` (git-ignored); `.env.example` documents what's needed
- Supabase clients: `@/lib/supabase/client` (browser), `@/lib/supabase/server` (Server Components/Actions), `@/lib/supabase/admin` (service-role, bypasses RLS — only where a member's own session genuinely can't do the job)
- `src/proxy.ts` is Next 16's renamed middleware; it refreshes the Supabase session on every request
- Brand palette and the three fonts are CSS variables in `src/app/globals.css`, exposed to Tailwind as `text-navy`, `font-display`, `font-mono` etc.

## Where to find detail
- Full feature-by-feature spec, all decisions and reasoning: `aOS_Claude_Code_Build_Brief.md`
- Full training content list and station mapping: `Training_Library_Grouping.md`
- Build sequence: `aOS_Dom_Build_Plan.md`
- Target output for the roadmap reveal document: `Sample_aOS_Roadmap_Reveal.html`
