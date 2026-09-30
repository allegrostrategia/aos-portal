-- aOS Reporting Tool — workspaces and access.
--
-- Brief: docs/reporting/reporting-tool-brief.md, §2 (who sees what) and §9
-- (data model). Stage 1 of §11.
--
-- IDENTITY, CONFIRMED BY NINA 30 SEPTEMBER 2026 — DO NOT CHANGE WITHOUT ASKING.
--
-- Retainer clients, Chiarezza attendees and Elize get an `auth.users` account
-- and NO `public.members` row. Not because a members row might make them an
-- admin (it wouldn't; `role` defaults to 'member'), but because
-- `has_portal_access()` is a MEMBERSHIP gate, not an authentication one, and
-- three shared surfaces read it with no ownership check at all:
--
--   · can_see_channel()  — every group channel in Piazza Sociale
--   · member_profiles    — the member directory
--   · draws, hot_seat_sessions
--
-- `has_portal_access()` is `status <> 'cancelled'`, so EVERY status admits
-- them. One members row inserted for convenience and a paying retainer client
-- is reading your members' private chat. The isolation is asserted by test,
-- not left to this comment — see "reporting identity isolation" in
-- supabase/tests/schema.test.mjs.
--
-- The consequence: an aOS member's workspace points at a real `members` row
-- (members.id IS the auth.users id), and everyone else's points at an
-- auth.users row with nothing behind it. `src/lib/auth/report.ts` is the
-- resolver for the second kind; `requireMember()` would bounce them.

-- =============================================================================
-- Enums
-- =============================================================================

-- Governs two behaviours: draft/publish (retainer only — §8, "self-serve
-- reports have no draft state") and access expiry (chiarezza only — §2).
create type public.report_workspace_kind as enum ('retainer', 'aos_member', 'chiarezza');

-- 'client' = the business's own login, however it got here. 'team' = an
-- Allegro staffer assigned to this one workspace (Elize). Nina needs no row:
-- she is `is_portal_admin()` and every policy here admits admins outright,
-- the same convention as the rest of this codebase.
create type public.report_access_role as enum ('client', 'team');

-- The eleven areas of §5. An enum rather than free text so a typo cannot be
-- stored in `hidden_categories` and silently hide nothing.
create type public.report_category as enum (
  'overview',
  'social_media',
  'trial_reels',
  'email',
  'funnels',
  'leads_conversions',
  'ads',
  'client_experience',
  'offers',
  'financials',
  'launches'
);

-- §5's four words, kept as four. 'pulled' matters: "New leads from ads" and
-- "Active clients at start" are neither typed nor calculated on the page —
-- they come from another category, and an entry form that offers them as
-- inputs would let the same number be typed twice (§4, "enter once, use
-- everywhere").
create type public.report_input_type as enum ('core', 'optional', 'calc', 'pulled');

create type public.report_unit as enum (
  'count', 'currency', 'percent', 'hours', 'ratio', 'months', 'text'
);

-- Which way is green (§5's "Good" column). 'none' for the ones marked n/a —
-- spend, lead source split — where a direction would be a lie.
create type public.report_good_direction as enum ('up', 'down', 'none');

-- The repeatable things of §5.5, §5.7, §5.9 and §5.2.
create type public.report_entity_type as enum ('offer', 'funnel', 'ad_campaign', 'social_platform');

create type public.report_note_type as enum ('strategist', 'reflection', 'objective', 'client_reply');

create type public.report_value_source as enum ('manual', 'csv');

-- =============================================================================
-- report_workspaces — one per business being reported on
-- =============================================================================

create table public.report_workspaces (
  id uuid primary key default gen_random_uuid(),

  kind public.report_workspace_kind not null,

  -- The client of record. For kind = 'aos_member' this IS `members.id`
  -- (members.id is the auth.users id — 20260807152726_members.sql), so join
  -- straight to members on it. For the other two kinds it points at an
  -- auth.users row with no members row behind it.
  --
  -- DELIBERATELY NOT UNIQUE (Nina, 30 Sep). Nobody knows yet whether a
  -- retainer client ever runs two businesses under one contract. Workspace and
  -- client are already separate concepts here — access is granted through
  -- `report_access`, not by owning the row — so a second workspace for the
  -- same login needs no schema change if it turns out somebody needs one. A
  -- unique constraint would be the one thing that made it a migration.
  owner_user_id uuid not null references auth.users (id) on delete cascade,

  business_name text not null,
  currency text not null default 'GBP',

  -- First month this workspace has data for. Not necessarily "now": a retainer
  -- client's history is entered in arrears.
  first_month date not null,

  -- Chiarezza only (§2: "on the end date the login stops working. Data is
  -- kept, not deleted"). Null = no expiry. Enforced in `report_can_view()`
  -- below, so it is a database fact and not only a screen that stops
  -- rendering — §13 asks for both.
  access_end_date date,

  -- §5.9. Optional per-client setting: the dashed line on "effective hourly
  -- rate by offer".
  target_hourly_rate numeric,

  -- §7 first-time setup, the three answers the benchmark prompt is built
  -- from. Nullable because the workspace exists before setup is done.
  benchmark_business_description text,
  benchmark_main_offers text,
  benchmark_country text,

  -- §8.1, self-serve only. Hidden categories don't appear and don't count
  -- towards completion.
  hidden_categories public.report_category[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_workspaces_first_month_is_first
    check (extract(day from first_month) = 1),
  constraint report_workspaces_access_end_after_first
    check (access_end_date is null or access_end_date >= first_month),
  -- Only Chiarezza expires. A retainer or member workspace with an end date
  -- would stop working on a date nobody meant to set.
  constraint report_workspaces_only_chiarezza_expires
    check (access_end_date is null or kind = 'chiarezza')
);

create index report_workspaces_owner_idx on public.report_workspaces (owner_user_id);
create index report_workspaces_kind_idx on public.report_workspaces (kind);

-- "Who is about to lose access" — cheap for the expiry sweep.
create index report_workspaces_access_end_date_idx
  on public.report_workspaces (access_end_date)
  where access_end_date is not null;

create trigger report_workspaces_set_updated_at
  before update on public.report_workspaces
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- report_access — the single grant list every other report_ table reads from
-- =============================================================================

create table public.report_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.report_access_role not null,

  -- These people have no `members` row, so there is nowhere else a name could
  -- come from — and `auth.users` is not readable under RLS. Without this the
  -- admin screen listing Elize's assigned clients has a column of UUIDs.
  display_name text not null,

  -- §2: "team access is by assignment, not a blanket team role."
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (workspace_id, user_id)
);

create index report_access_user_idx on public.report_access (user_id);

-- =============================================================================
-- The three helpers every policy below is written in terms of.
--
-- One definition each, because the draft this replaces copied the same
-- three-branch visibility test into six policies and got it subtly different
-- in four of them.
-- =============================================================================

-- Can I see this workspace at all? Chiarezza expiry lands here, so it applies
-- to every table at once rather than to whichever screens remembered it.
-- A team member's access does not expire with the client's window: Allegro
-- keeps working on the data after the attendee's login has stopped.
create or replace function public.report_can_view(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_access ra
    join public.report_workspaces w on w.id = ra.workspace_id
    where ra.workspace_id = p_workspace_id
      and ra.user_id = (select auth.uid())
      and (
        ra.role = 'team'
        or w.access_end_date is null
        or w.access_end_date >= current_date
      )
      -- Rule 7: cancelling revokes access and keeps every record. For an aOS
      -- member the reporting tool is one more area of a membership, so it
      -- goes when the membership does — their figures stay, exactly as their
      -- log and roadmap do. A retainer or Chiarezza login has no members row
      -- and no membership to lose, and a team assignment is Allegro's, so
      -- neither is subject to this.
      and (
        ra.role = 'team'
        or w.kind <> 'aos_member'
        or public.has_portal_access()
      )
  );
$$;

comment on function public.report_can_view(uuid) is
  'Access to a reporting workspace, with Chiarezza expiry applied. A team assignment does not expire with the client''s window.';

-- Can I change the numbers? §2's role table: a retainer client views and
-- comments, never edits — Elize and Nina enter their data. A self-serve
-- client (aOS member, Chiarezza) enters their own. A team assignment always
-- edits.
create or replace function public.report_can_edit(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_access ra
    join public.report_workspaces w on w.id = ra.workspace_id
    where ra.workspace_id = p_workspace_id
      and ra.user_id = (select auth.uid())
      and (
        ra.role = 'team'
        or (ra.role = 'client' and w.kind <> 'retainer')
      )
      and (
        ra.role = 'team'
        or w.access_end_date is null
        or w.access_end_date >= current_date
      )
      and (
        ra.role = 'team'
        or w.kind <> 'aos_member'
        or public.has_portal_access()
      )
  );
$$;

comment on function public.report_can_edit(uuid) is
  'Write access to a workspace''s figures. False for a retainer client by design (§2): they view and comment, Allegro enters.';

alter table public.report_workspaces enable row level security;
alter table public.report_access enable row level security;

-- Nina reads and writes everything, same convention as every _all_admin
-- policy in this codebase.
create policy report_workspaces_all_admin
  on public.report_workspaces for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy report_access_all_admin
  on public.report_access for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- The workspace record itself — name, currency, hidden categories, setup
-- answers. Metadata about the business, not the month's figures; those live in
-- report_values and carry the publish gate.
create policy report_workspaces_select_granted
  on public.report_workspaces for select
  to authenticated
  using (public.report_can_view(id));

-- Editors update the workspace. A retainer CLIENT is excluded structurally
-- rather than by a trigger, because report_can_edit() is already false for
-- them — which is why they cannot rename their own business or clear their
-- benchmark setup. The guard below only has to hold back the columns that are
-- Nina's even from an editor.
create policy report_workspaces_update_editors
  on public.report_workspaces for update
  to authenticated
  using (public.report_can_edit(id))
  with check (public.report_can_edit(id));

create or replace function public.guard_report_workspace_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `auth.uid() is null` is the service role: the cron and `after()` jobs have
  -- no JWT, so is_portal_admin() is false for them. A guard admitting only
  -- admins refuses the system — this codebase has been bitten twice (the day-7
  -- pairing flag, the handover pack), and the Chiarezza expiry sweep writes
  -- access_end_date, which is one of the columns blocked below.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.kind is distinct from old.kind
     or new.owner_user_id is distinct from old.owner_user_id
     or new.access_end_date is distinct from old.access_end_date
     or new.first_month is distinct from old.first_month
  then
    raise exception 'Only an admin can change a workspace''s kind, owner, access end date or first month';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_workspace_admin_fields() is
  'An editor may set hidden categories, benchmark answers, target rate, name and currency; kind, owner, access window and first month are Nina''s.';

create trigger report_workspaces_guard_admin_fields
  before update on public.report_workspaces
  for each row
  execute function public.guard_report_workspace_admin_fields();

-- A user reads their own grants, so the app can tell a 'client' login from a
-- 'team' one. No self-service insert, update or delete: assignment is
-- admin-only, enforced by there being no policy for it.
create policy report_access_select_own
  on public.report_access for select
  to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Admin entry points
--
-- A workspace and its owning client's grant are created in one call, so the
-- app can never leave a workspace nobody can reach. Mirrors create_member().
-- =============================================================================

create or replace function public.create_report_workspace(
  p_owner_user_id uuid,
  p_kind public.report_workspace_kind,
  p_business_name text,
  p_owner_display_name text,
  p_first_month date,
  p_currency text default 'GBP',
  p_access_end_date date default null
)
returns public.report_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.report_workspaces;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can create a reporting workspace';
  end if;

  insert into public.report_workspaces (
    owner_user_id, kind, business_name, currency, first_month, access_end_date
  )
  values (
    p_owner_user_id, p_kind, p_business_name, p_currency,
    date_trunc('month', p_first_month)::date, p_access_end_date
  )
  returning * into v_workspace;

  insert into public.report_access (workspace_id, user_id, role, display_name, assigned_by)
  values (v_workspace.id, p_owner_user_id, 'client', p_owner_display_name, (select auth.uid()));

  return v_workspace;
end;
$$;

create or replace function public.assign_report_team_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns public.report_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.report_access;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can assign a team member to a reporting workspace';
  end if;

  -- Never over an existing client grant: that would silently turn the client's
  -- own login into a team login on their own workspace.
  if exists (
    select 1 from public.report_access
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'client'
  ) then
    raise exception 'That login is the client on this workspace, not a team member';
  end if;

  insert into public.report_access (workspace_id, user_id, role, display_name, assigned_by)
  values (p_workspace_id, p_user_id, 'team', p_display_name, (select auth.uid()))
  on conflict (workspace_id, user_id)
    do update set role = 'team', display_name = excluded.display_name
  returning * into v_access;

  return v_access;
end;
$$;

-- Removing an assignment is a real delete, and rule 7 is not in tension with
-- it: a grant is permission, not a record of anything. Nothing the team member
-- wrote is touched — their notes keep their author name (report_notes stores
-- it alongside the id for exactly this reason).
create or replace function public.unassign_report_team_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can remove a team member from a reporting workspace';
  end if;

  delete from public.report_access
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and role = 'team';
end;
$$;

revoke all on function public.create_report_workspace(uuid, public.report_workspace_kind, text, text, date, text, date) from public;
revoke all on function public.assign_report_team_member(uuid, uuid, text) from public;
revoke all on function public.unassign_report_team_member(uuid, uuid) from public;

grant execute on function public.create_report_workspace(uuid, public.report_workspace_kind, text, text, date, text, date) to authenticated;
grant execute on function public.assign_report_team_member(uuid, uuid, text) to authenticated;
grant execute on function public.unassign_report_team_member(uuid, uuid) to authenticated;
