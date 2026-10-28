# aOS — one-page handoff (27 October 2026)

*Paste this into a fresh chat. The full picture is `docs/aOS_Current_State.md` (~34,000 words) — attach it when the detail matters.*

## What aOS is

A membership portal for service-based founders, under Allegro Strategia. Next.js 16 + Supabase + Vercel, live at `aos.allegrostrategia.com`. **The repository is public on purpose**, so no real client data goes in it.

Two products in one app:

- **The membership** — onboarding, Piazza, The Map, La Strada, the log and timer, the hot seat, chat, pairing, the recap, the draw, Archivio. Feature-complete for current scope; the only open item is Step 13's Vespa intro video, which has no asset.
- **The reporting tool** — a monthly report for retainer clients who are *not* members, plus a self-serve version for members. This is where all recent work has gone.

## Where reporting stands

**Finished and switched off.** Six stages:

| | | |
| --- | --- | --- |
| 1–2 | Schema, entry screens, the Overview, draft/publish | **live and in use** |
| 3 | The remaining tabs, targets, benchmarks, traffic lights, panels | built, **off** |
| 4 | Launches — setup, entry, report, planner, compare | built, **off** |
| 5 | aOS members reporting on themselves | built, **off** |
| 6 | Meta CSV uploads | built, **off** |

Stages 3–6 sit behind `SHIPPED_STAGE`, pinned to `PRODUCTION_STAGE = 2` in `src/lib/reporting/categories.ts`. **No Vercel variable can move it** — the override is gated on `NODE_ENV === "development"`, and a test asserts that.

**What's left, in order:** Nina's review → the launch checklist → move the flag. Nobody joins until she's looked.

## The numbers

- **85 migrations**, all applied to live.
- **540 unit / 415 database / 216 browser** tests, all run 27 October, all exit 0. Guarded by `npm run test:census`, which refuses a silent drop.
- `main` at `d368b7b`, pushed, nothing held.

## Three things to know before touching anything

1. **aOS now has its own Supabase token, in `.env.local` as `SUPABASE_ACCESS_TOKEN`** (gitignored; `npm run db:projects` checks it). It needed one: `~/.supabase/access-token` holds a single token per machine, so a CLI login for `allegro-captures-portal` on 18 October evicted the aOS one and every Management API call answered "your account does not have the necessary privileges". Nothing leaked — no token or key has ever been committed, across all 336 commits. **No migrations until the new token is in and live state has been re-verified against the record.**
2. **The browser suite was green for weeks while nothing hydrated.** Next answered 403 to its own JS chunks because Playwright drives `127.0.0.1` and Next thought it was `localhost`. Fixed; guarded by `e2e/hydration.spec.ts`. Ten tests failed the moment it started working — every one an assertion that had never really waited.
3. **The live sign-in checks were skipped** on 9 October and are on the launch checklist, marked not done.

## Standing rules that bite

- **Nothing is ever deleted** — cancelling revokes access and keeps every record. Every table holding member content needs `has_portal_access()` in its RLS.
- **No AI runs inside the app, anywhere.** Settled, final.
- **A figure nobody entered shows a dash, never a zero.**
- **Mobile and desktop both work, always** — built together, not a pass at the end.
- **Plain HTML first, by default** — a form that works without JavaScript beats one that doesn't. Not a prohibition.
- **A guard that admits only `is_portal_admin()` refuses the service role too** — the cron has no JWT, so it needs `or (select auth.uid()) is null`.
- **Realtime tables go in the publication by migration**, never the dashboard.

## For Nina

`docs/nina-review/` — the thirty-eight decisions taken on her behalf (plain English, each with what changes if she disagrees), twenty-eight Stage 4–6 screens at both widths plus fifteen from Stage 3, and the launch checklist.

## Where the detail lives

| | |
| --- | --- |
| `docs/aOS_Current_State.md` | where we actually left off — the one to attach |
| `CLAUDE.md` | the rules that apply everywhere |
| `docs/aOS_Claude_Code_Build_Brief.md` | the full spec |
| `docs/reporting/reporting-tool-brief.md` | the reporting spec, by section number |
| `docs/nina-review/` | the review pack |
