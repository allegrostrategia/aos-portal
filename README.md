# aOS — Allegro Operating System

A membership portal for ambitious, service-based founders, under the parent brand
Allegro Strategia. Every month, one real thing costing time or money gets built
live, based on real tracked data.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind v4 · Supabase · Vercel
(`aos.allegrostrategia.com`).

## Getting started

```bash
cp .env.example .env.local   # then paste the real Supabase keys in
npm install
npm run dev
```

Open http://localhost:3000.

Supabase credentials are required now that auth is wired up: without them
`/login` and `/forgot-password` still render, but anything behind a session
fails loudly with a message naming the missing variable.

## Auth

Members are created by an admin and invited by email — there is no self-signup,
and no route that creates one.

| Route | |
|---|---|
| `/login` | Email and password |
| `/forgot-password` | Requests a reset link |
| `/auth/confirm` | Where every emailed link lands; verifies and starts the session |
| `/set-password` | Sets the first password after an invitation, and finishes a reset |
| `/no-access` | Cancelled members, and signed-in users with no member record |

Access is decided in two places, deliberately. [src/proxy.ts](src/proxy.ts) does
an optimistic check — is there a session — because it runs on every request
including prefetches, so a database lookup there would sit behind every hovered
link. The real gate is `requireMember()` in the portal layout, which is what
knows about `onboarding` / `active` / `cancelled`.

### Supabase dashboard settings this depends on

Under **Authentication**:

1. **URL Configuration** — Site URL, plus `/auth/confirm` under Redirect URLs,
   for both `http://localhost:3000` and `https://aos.allegrostrategia.com`.
2. **Email Templates** → *Invite user* and *Reset password*. The defaults point
   at Supabase's own verify endpoint, which doesn't set a cookie session. Point
   them here instead:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password
   ```

   Use `type=recovery` in the reset template.
3. **Providers → Email** — set minimum password length to 8, to match what the
   form tells people.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run test:db` | Run every migration against an in-process Postgres and exercise the RLS policies. No Docker or database needed. |
| `npm run db:push` | Apply pending migrations to the linked Supabase project |
| `npm run db:diff` | Show what the linked project has that the migrations don't |

### Connecting to Supabase

**`supabase link` does not currently work on this project.** It fails with
`SchemaError … inserted_at` while fetching API keys — a CLI/API mismatch on
Supabase's side, not a problem with the project or the ref. Push over a direct
connection instead, which skips that step entirely:

```bash
npm run test:db                             # always, before pushing
npm run db:push -- --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" --dry-run
```

Drop `--dry-run` once the migration list looks right. The password is the
database password from project creation, percent-encoded if it has symbols in it.

Two things worth knowing about that host: it is **IPv6-only** (no A record), so it
fails from any IPv4-only network — that's the likely cause if it suddenly stops
resolving. And `db push` prints a Docker warning about caching the migrations
catalog; it's cosmetic, the push has already succeeded by then.

If the direct connection is ever unavailable, `npm run db:bundle` concatenates
every migration in order into `supabase/.temp/bundle.sql` to paste into the SQL
editor. That bypasses the migration history table, so follow it with
`npx supabase migration repair --status applied <version>` for each one.

## Layout

```
src/app/          routes and screens
src/lib/env.ts    environment access, fails loudly with a fix-it message
src/lib/auth/     sign-in actions, and requireMember() — the real access gate
src/lib/supabase/ browser / server / admin clients
src/proxy.ts      Next 16 middleware — refreshes the Supabase session
supabase/         migrations and schema tests
public/           brand, station and illustration assets
docs/             the build brief, build plan, and content mapping
```

## Documentation

- `CLAUDE.md` — the rules that apply to every feature
- `docs/aOS_Claude_Code_Build_Brief.md` — full feature spec, decision by decision
- `docs/aOS_Dom_Build_Plan.md` — the build sequence
- `docs/Training_Library_Grouping.md` — training content and station mapping
