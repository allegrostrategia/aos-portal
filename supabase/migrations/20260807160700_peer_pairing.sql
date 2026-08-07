-- aOS — peer pairing.
--
-- Build Brief §9 (Peer pairing).
--
-- Monthly, 1:1, mutual: both bring a challenge, both give and receive. Matched by
-- ROTATION, never by skill or business type — deliberately, so nobody is ever "the
-- one who's never picked." The business-model and team-size data from the audit is
-- explicitly kept out of matching, so hierarchy doesn't creep back in through the
-- side door (§9). Nothing in this file reads it.

create table public.pairing_availability (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- First day of the month being matched.
  pairing_month date not null,

  -- Free shape while the availability UI is undecided: day/time windows the
  -- member can do. Only used to find an overlap.
  availability jsonb not null default '{}'::jsonb,

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, pairing_month),
  constraint pairing_availability_month_is_first check (extract(day from pairing_month) = 1)
);

create trigger pairing_availability_set_updated_at
  before update on public.pairing_availability
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The pairing itself
--
-- Participants live in their own table rather than as member_a/member_b columns.
-- Two columns can't express "this member is in exactly one pairing this month"
-- as a constraint — they'd let someone be A in one pairing and B in another — and
-- the odd-numbers case (§9: the unpaired member gets Nina, still genuinely mutual)
-- is just another participant row rather than a special case.
-- ---------------------------------------------------------------------------

create table public.pairings (
  id uuid primary key default gen_random_uuid(),
  pairing_month date not null,

  -- The time the system proposed from their overlapping availability. The pair
  -- then reach out to each other directly to arrange the actual call — the
  -- platform deliberately generates no call link here, unlike the Nina-hosted hot
  -- seat (§9).
  scheduled_for timestamptz,

  -- Met or not is tracked over time as signal, not shame (§9).
  met_at timestamptz,

  -- Raised on day 7 if the pair still haven't confirmed. Goes to NINA, not to the
  -- pair, so a stalled pairing doesn't silently never happen (§9).
  flagged_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pairings_month_is_first check (extract(day from pairing_month) = 1)
);

create table public.pairing_participants (
  pairing_id uuid not null references public.pairings (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,

  -- Denormalised from the pairing so one member per month can be enforced.
  pairing_month date not null,

  primary key (pairing_id, member_id),

  -- The constraint the two-column shape couldn't express.
  unique (member_id, pairing_month)
);

create index pairings_month_idx on public.pairings (pairing_month);
create index pairing_participants_member_idx
  on public.pairing_participants (member_id, pairing_month desc);

create trigger pairings_set_updated_at
  before update on public.pairings
  for each row
  execute function public.set_updated_at();

-- Keeps the denormalised month honest.
create or replace function public.sync_pairing_participant_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select pairing_month into new.pairing_month
  from public.pairings where id = new.pairing_id;

  return new;
end;
$$;

create trigger pairing_participants_sync_month
  before insert or update on public.pairing_participants
  for each row
  execute function public.sync_pairing_participant_month();

-- ---------------------------------------------------------------------------
-- Access helper
--
-- A member needs to see their own pairing and who their partner is. Expressing
-- that directly in a policy on pairing_participants would query the same table the
-- policy is on, which Postgres rejects as infinite recursion — hence a
-- security-definer helper.
-- ---------------------------------------------------------------------------

create or replace function public.is_my_pairing(p_pairing_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pairing_participants
    where pairing_id = p_pairing_id
      and member_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Pairing is locked until active (§1): it's built around a live challenge, which
-- onboarding members don't have yet. First eligible month is the same month as
-- their first hot seat (§9), which admin decides — the gate here is just `active`.
-- ---------------------------------------------------------------------------

alter table public.pairing_availability enable row level security;
alter table public.pairings enable row level security;
alter table public.pairing_participants enable row level security;

create policy pairing_availability_select_own
  on public.pairing_availability for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy pairing_availability_write_own
  on public.pairing_availability for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.is_active_member());

create policy pairing_availability_update_own
  on public.pairing_availability for update
  to authenticated
  using (member_id = (select auth.uid()) and public.is_active_member())
  with check (member_id = (select auth.uid()));

create policy pairing_availability_all_admin
  on public.pairing_availability for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy pairings_select_own
  on public.pairings for select
  to authenticated
  using (public.has_portal_access() and public.is_my_pairing(id));

-- The pair confirm they met. Nothing else about the pairing is theirs to change —
-- matching and the day-7 flag are the system's and Nina's respectively.
create policy pairings_update_met_own
  on public.pairings for update
  to authenticated
  using (public.has_portal_access() and public.is_my_pairing(id))
  with check (public.is_my_pairing(id));

create policy pairings_all_admin
  on public.pairings for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- Seeing your partner: you can read the participant rows of a pairing you're in.
create policy pairing_participants_select_own
  on public.pairing_participants for select
  to authenticated
  using (public.has_portal_access() and public.is_my_pairing(pairing_id));

create policy pairing_participants_all_admin
  on public.pairing_participants for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- Note: matching itself is not in the database
-- ---------------------------------------------------------------------------
--
-- Rotation matching is an admin action, not a trigger or a scheduled job here. It
-- needs to know who has been paired with whom before — readable from
-- pairing_participants — and to avoid repeats where it can, which is ordinary
-- application logic and much easier to correct by hand when the rotation lands
-- awkwardly. §9's constraint is only that it must NOT consider skill or business
-- type; nothing in this schema exposes those to the matcher.
