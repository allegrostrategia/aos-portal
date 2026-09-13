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

## Brand system — L'Editoriale (since 13 September 2026)
The visual direction is the "L'Editoriale" reference poster (`docs/LEditoriale_full_reference_poster.png`, brief in `docs/aOS_LEditoriale_Redesign_Brief.md`): editorial, magazine-like — large upright serif display type, numbered list rows, softly rounded cream cards, warm full-bleed imagery, pill buttons. Same palette, fuller expression of it. **These rules replace the earlier ones (cool off-white ground, italic headings, navy buttons, mono eyebrows) — do not drift back.**

- **Palette:** navy `#073C8C`, orange `#FF6625`, gold `#FFD551`, sky `#A4D3EB`, blush `#FFB29E`, lemon cream `#F8E6A0`. Plus the L'Editoriale surfaces: cream ground `#FBF5EA`, card `#F9F2E6`, cream-deep `#F4EEE4` (wells, list rows), ink `#0A1E4A` (all text — headings and body), charcoal `#1B1920` (the dark feature card). Navy is now for the map lines, nav state and where the colour itself is the point; text is ink.
- **Type:** Cormorant Garamond **upright, medium weight** for headings and display values (`font-display font-medium text-ink`); **italic is reserved for quotations** (`<Quote>`). Inter for body/UI *and* for the tracked uppercase eyebrows/taglines. JetBrains Mono for numbers and data only — hours reclaimed, revenue, dates.
- **Surfaces:** `<Card>` is cream, `rounded-card`, hairline, soft warm shadow — never white-on-cool. `tone="dark"` for the hot seat feature card, `tone="orange"` for the timer. **`backdrop-filter: blur` is allowed in exactly two places** (bottom nav, the stat strip over the Piazza hero), gated by `--aos-glass-blur` in `globals.css` so a phone test can switch it off everywhere at once. Never on cards over plain ground.
- **Buttons:** pills. Primary is **orange with white text** — a known ~2.9:1 contrast, accepted as the direction with semibold 16px+ text as the mitigation; the alternative (ink text on orange, 3.5:1) is one line in `button.tsx`.
- **Lists:** the editorial numbered row (`<NumberedRow>`) for lessons, tools, stations, folders. One component, so the indices line up across screens.
- **Navigation:** five items — Piazza, La Strada, Sociale, Log, You. Hot seat, Milestones and Pairing are cards on Piazza with real routes in; the Library is a toggle on La Strada; admin routes are in the desktop sidebar and on You.

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
