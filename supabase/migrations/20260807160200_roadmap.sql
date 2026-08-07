-- aOS — roadmap and roadmap history.
--
-- Build Brief §1 (Data structure), §3 (Where the roadmap lives).
--
-- The roadmap lives here as STRUCTURED DATA, never as a generated document or a
-- per-member file. La Strada is one shared template for everyone; what makes it
-- personal is this row, pulled on load (§3). Nothing is ever generated or pushed
-- per member — that's the rule the whole build is organised around.

create type public.roadmap_reason as enum (
  'onboarding',      -- the initial roadmap, drafted from the audit at the week-4 1:1
  'monthly_repoint',
  'recommit'         -- the fresh 6-month roadmap at contract term end
);

-- Who settled the wording. Every roadmap is Claude-drafted and Nina-confirmed
-- (§3), so this records whether she took the draft as-is or changed it — which is
-- the only honest way to know whether the drafting is actually any good yet.
create type public.drafted_by as enum ('claude', 'nina');

create table public.roadmap (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- The phases, as structured data. Shape is deliberately open while the roadmap
  -- format is still settling: [{ "title": ..., "station_slug": ..., "items": [...] }].
  phases jsonb not null default '[]'::jsonb,

  -- This month's focus. Kept as two separate things on purpose (§3): the STATION
  -- is the place, the CHALLENGE is the specific named thing being built. Merging
  -- them loses the distinction the member actually experiences.
  current_focus text,
  current_focus_station_slug text references public.stations (slug),

  -- Why this roadmap exists. Same values as roadmap_history.reason.
  reason public.roadmap_reason not null,
  -- The audit this was drafted from, where there was one.
  source_audit_id uuid references public.member_audits (id) on delete set null,

  -- AI drafts, Nina confirms — never live to a member before she's seen it.
  drafted_by public.drafted_by not null default 'claude',
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,

  -- Exactly one current roadmap per member, enforced below.
  is_current boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One current roadmap per member. This replaces the `current_roadmap_id` column
-- §1 sketches on `members`: the lookup is the same, but with one source of truth
-- instead of a pointer and a flag that can disagree. Same reasoning as declining
-- a redundant recommit_completed_at.
create unique index roadmap_one_current_per_member_idx
  on public.roadmap (member_id)
  where is_current;

create index roadmap_member_id_idx on public.roadmap (member_id, created_at desc);

create trigger roadmap_set_updated_at
  before update on public.roadmap
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- History
--
-- §1/§3: a simple log of each re-point, so movement over time is visible rather
-- than only the current state. A recommit roadmap and a routine monthly nudge are
-- different events with different weight, hence `reason`.
-- ---------------------------------------------------------------------------

create table public.roadmap_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  roadmap_id uuid references public.roadmap (id) on delete set null,

  reason public.roadmap_reason not null,

  -- What the roadmap looked like at this point. A copy, not a reference — the
  -- history has to survive the roadmap being re-pointed underneath it.
  phases_snapshot jsonb not null default '[]'::jsonb,
  current_focus text,
  current_focus_station_slug text references public.stations (slug),

  -- Why it moved, in Nina's words. Optional.
  note text,

  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index roadmap_history_member_id_idx
  on public.roadmap_history (member_id, changed_at desc);

-- Log every roadmap as it's created, so the history is complete without the app
-- having to remember to write to two tables.
create or replace function public.log_roadmap_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roadmap_history (
    member_id, roadmap_id, reason,
    phases_snapshot, current_focus, current_focus_station_slug, changed_by
  )
  values (
    new.member_id, new.id, new.reason,
    new.phases, new.current_focus, new.current_focus_station_slug, (select auth.uid())
  );

  return new;
end;
$$;

create trigger roadmap_log_history
  after insert on public.roadmap
  for each row
  execute function public.log_roadmap_history();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.roadmap enable row level security;
alter table public.roadmap_history enable row level security;

-- A member reads their own roadmap, but only once Nina has confirmed it. An
-- unconfirmed draft is working material, not something to show anyone.
create policy roadmap_select_own_confirmed
  on public.roadmap for select
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and confirmed_at is not null
  );

-- Members never write their own roadmap — it's drafted by Claude and confirmed by
-- Nina through the admin panel (§3). No insert or update policy for them.
create policy roadmap_all_admin
  on public.roadmap for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- History is the member's own movement over time — theirs to see.
create policy roadmap_history_select_own
  on public.roadmap_history for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy roadmap_history_all_admin
  on public.roadmap_history for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
