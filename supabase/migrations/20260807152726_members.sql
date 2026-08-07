-- aOS — members table, lifecycle, roles and RLS.
--
-- Build Brief §1 (Data structure), §7 (Admin).
--
-- Members are created MANUALLY by Nina/the team through the admin panel, once
-- payment and the signed contract are both confirmed. There is no HeyClients or
-- Stripe webhook, and no self-signup — so there is deliberately no INSERT policy
-- for ordinary members, and no trigger creating a member row from auth.users.
-- Creating a member is an admin-only act; see §7 and `create_member()` below.
--
-- Nothing in this file ever deletes a member or their data. Cancelling revokes
-- access and leaves every record intact; rejoining runs onboarding again from
-- scratch against the same row.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- onboarding → active → cancelled. No paused state: a member is either in the
-- programme or they aren't, and cancelling is reversible without one.
create type public.member_status as enum ('onboarding', 'active', 'cancelled');

create type public.member_role as enum ('member', 'admin');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.members (
  -- One row per authenticated user. The auth user is created first (by invite,
  -- from the admin panel), and this row is created against it.
  id uuid primary key references auth.users (id) on delete cascade,

  email text not null unique,
  full_name text not null,

  role public.member_role not null default 'member',
  status public.member_status not null default 'onboarding',

  -- §1 Cadence.
  -- join_date is the FIRST time this person ever joined and never changes — it
  -- survives cancelling and rejoining, so "member since" stays true.
  -- onboarding_start_date is the anchor the current onboarding sequence runs
  -- from, and IS reset on rejoin. Read this one for sequence logic, not join_date.
  join_date date not null default current_date,
  onboarding_start_date date,
  cohort_start_date date,

  -- §1 Step zero. Gates the audit form — the sequence check, not a quiz result.
  -- Cleared on rejoin: onboarding runs again from scratch, welcome session included.
  welcome_session_watched_at timestamptz,

  -- §7. What the team actually confirms before creating the record. Kept as
  -- timestamps rather than booleans so "when was this checked" survives.
  payment_confirmed_at timestamptz,
  contract_signed_at timestamptz,

  -- Minimum term from the signed contract: 6 months, then rolling monthly.
  -- Stored rather than hardcoded so a bespoke agreement can differ, but 6 is the
  -- standard and the default.
  --
  -- REFERENCE ONLY for access purposes: the term is enforced by the contract and
  -- by HeyClients billing, never by this app. Nothing in the portal reads these
  -- to allow or block anything.
  contract_term_months smallint not null default 6 check (contract_term_months > 0),

  -- The day the minimum term ends — i.e. the recommit milestone. After this date
  -- membership is rolling monthly, so this is NOT extended each month; it stays
  -- as the end of the initial commitment and becomes historical once passed.
  -- Reset to a fresh 6 months if a cancelled member rejoins.
  --
  -- This one date does have a job beyond reference: it's what tells admin who is
  -- coming up for their recommit 1:1 and refreshed audit (see note 4 at the foot
  -- of this file). Set explicitly rather than generated, so it can be matched to
  -- whatever HeyClients actually bills.
  contract_term_end_date date,

  -- Set when access is revoked, cleared on rejoin. The full history of every
  -- cancellation lives in member_status_events, so clearing this loses nothing.
  cancelled_at timestamptz,

  -- Who created the record, for a plain audit trail of manual creation.
  created_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link to the member's current roadmap (§1, §3). The roadmap table lands in the
-- next migration; adding the column then keeps this one self-contained.
-- TODO(step-1): alter table public.members add column current_roadmap_id uuid
--   references public.roadmap (id) on delete set null;

create index members_status_idx on public.members (status);
create index members_cohort_start_date_idx on public.members (cohort_start_date);

-- Admin's "who's coming up for recommit?" query. Partial, because a cancelled
-- member's term end is history, not a milestone anyone is working towards.
create index members_contract_term_end_date_idx
  on public.members (contract_term_end_date)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Status history
--
-- Every status transition is logged rather than overwritten, so a member who
-- cancels and rejoins has a legible timeline instead of a row that quietly looks
-- like a first-time member. Also how `is_returning_member()` knows.
-- ---------------------------------------------------------------------------

create table public.member_status_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  from_status public.member_status,
  to_status public.member_status not null,
  -- Free text: why they cancelled, what changed. Optional.
  note text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index member_status_events_member_id_idx
  on public.member_status_events (member_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_set_updated_at
  before update on public.members
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Status logging
-- ---------------------------------------------------------------------------

create or replace function public.log_member_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.member_status_events (member_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.member_status_events (member_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;

  return new;
end;
$$;

create trigger members_log_status_event
  after insert or update of status on public.members
  for each row
  execute function public.log_member_status_event();

-- ---------------------------------------------------------------------------
-- Role and access helpers
--
-- PLACEHOLDER IMPLEMENTATIONS for get_my_role() / is_portal_admin(). The brief
-- (§7, §1) says to fork the working security-definer functions from the existing
-- Allegro Portal rather than inventing a new access system. Nina hasn't granted
-- repo access yet, so these keep the same names and signatures and read from
-- `members.role` — swap the bodies for the real ones when the SQL arrives. The
-- policies below shouldn't need to change when that happens.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_role()
returns public.member_role
language sql
security definer
stable
-- Empty search_path so a caller can't shadow `members` with their own table.
set search_path = ''
as $$
  select role from public.members where id = (select auth.uid());
$$;

create or replace function public.is_portal_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select role = 'admin' from public.members where id = (select auth.uid())),
    false
  );
$$;

-- The gate for every piece of portal content. Cancelling revokes all access, so
-- EVERY table added from here on should carry `using (public.has_portal_access())`
-- alongside its ownership check — Piazza, La Strada, the weekly log, the library,
-- chat, all of it. Cancelled members keep their data; they just can't reach it.
create or replace function public.has_portal_access()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select status <> 'cancelled' from public.members where id = (select auth.uid())),
    false
  );
$$;

-- True if this member has cancelled at least once before, i.e. they are rejoining
-- rather than joining. Their onboarding runs from scratch either way, but their
-- previous work is theirs to keep — see the handover pack note at the foot of
-- this file.
create or replace function public.is_returning_member(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.member_status_events
    where member_id = p_member_id and to_status = 'cancelled'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.member_status_events enable row level security;

-- A member reads their own row — including while cancelled, deliberately. If a
-- cancelled member couldn't read their own status the app would have no way to
-- tell them their membership has ended, and would simply appear broken. The row
-- itself carries no programme content; `has_portal_access()` gates that.
create policy members_select_own
  on public.members for select
  to authenticated
  using (id = (select auth.uid()));

-- Admins read everyone (§7: general member/roadmap visibility, audit data).
create policy members_select_all_admin
  on public.members for select
  to authenticated
  using (public.is_portal_admin());

-- A member updates their own row, but not their role, status, lifecycle dates or
-- contract terms — those are the team's to set. Enforced by the trigger below,
-- since column-level restrictions can't be expressed in a policy alone. Cancelled
-- members can't update at all.
create policy members_update_own
  on public.members for update
  to authenticated
  using (id = (select auth.uid()) and public.has_portal_access())
  with check (id = (select auth.uid()));

create policy members_update_all_admin
  on public.members for update
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- No INSERT or DELETE policy for `authenticated` on purpose: members are created
-- by the admin panel through `create_member()` and never self-signup (§7), and
-- nothing here is ever deleted.

-- Status history is admin-only reading. It's an operational record, not something
-- a member needs on their own screen.
create policy member_status_events_select_admin
  on public.member_status_events for select
  to authenticated
  using (public.is_portal_admin());

create or replace function public.protect_member_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.join_date is distinct from old.join_date
    or new.onboarding_start_date is distinct from old.onboarding_start_date
    or new.cohort_start_date is distinct from old.cohort_start_date
    or new.payment_confirmed_at is distinct from old.payment_confirmed_at
    or new.contract_signed_at is distinct from old.contract_signed_at
    or new.contract_term_months is distinct from old.contract_term_months
    or new.contract_term_end_date is distinct from old.contract_term_end_date
    or new.cancelled_at is distinct from old.cancelled_at
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Only an admin can change member role, status, lifecycle dates or contract terms';
  end if;

  return new;
end;
$$;

create trigger members_protect_admin_fields
  before update on public.members
  for each row
  execute function public.protect_member_admin_fields();

-- ---------------------------------------------------------------------------
-- Admin: create a member (§7)
--
-- This is what actually starts someone's onboarding sequence.
--
-- The auth user must exist first. Creating one is an Auth API call, not a table
-- insert, so the admin panel does it in two steps against the service-role
-- client: invite the email address, then call this function with the returned
-- id. Kept as a function rather than a bare insert so the admin panel can't
-- accidentally create a half-populated member, and so the rules for what a new
-- member looks like live in one place.
--
-- BOOTSTRAP: this function requires an existing admin, so the FIRST admin cannot
-- come through it. Seed Nina's row once by hand, in the Supabase SQL editor,
-- after her auth user exists:
--
--   insert into public.members (id, email, full_name, role, status)
--   values ('<her auth.users id>', '<her email>', 'Nina', 'admin', 'active');
--
-- There is no INSERT policy on `members` for anyone, admins included, so that
-- statement has to run as the service role. Deliberate: it should be a conscious
-- one-off, not something the app can do.
-- ---------------------------------------------------------------------------

create or replace function public.create_member(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_payment_confirmed_at timestamptz default now(),
  p_contract_signed_at timestamptz default now(),
  p_contract_term_months smallint default 6,
  p_join_date date default current_date,
  -- Override only when the billed term end doesn't line up with join date + term.
  p_contract_term_end_date date default null
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can create a member';
  end if;

  -- Both confirmations are required before access exists — that is the whole
  -- reason this step is manual (§7).
  if p_payment_confirmed_at is null or p_contract_signed_at is null then
    raise exception 'Payment and signed contract must both be confirmed before creating a member';
  end if;

  insert into public.members (
    id, email, full_name, status,
    join_date, onboarding_start_date,
    payment_confirmed_at, contract_signed_at,
    contract_term_months, contract_term_end_date, created_by
  )
  values (
    p_user_id, p_email, p_full_name, 'onboarding',
    p_join_date, p_join_date,
    p_payment_confirmed_at, p_contract_signed_at,
    p_contract_term_months,
    coalesce(
      p_contract_term_end_date,
      (p_join_date + make_interval(months => p_contract_term_months))::date
    ),
    (select auth.uid())
  )
  returning * into v_member;

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: cancel a member (§7)
--
-- Revokes access. Deletes nothing — every submission, roadmap, handover pack and
-- chat message stays exactly where it is.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_member(
  p_member_id uuid,
  p_note text default null
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can cancel a member';
  end if;

  select * into v_member from public.members where id = p_member_id;

  if v_member.id is null then
    raise exception 'No member with id %', p_member_id;
  end if;

  -- Guarded so the note below can't attach itself to an older cancellation
  -- event: a no-op status update fires no trigger, so there'd be no new row.
  if v_member.status = 'cancelled' then
    raise exception 'Member % is already cancelled', p_member_id;
  end if;

  update public.members
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_member_id
  returning * into v_member;

  if p_note is not null then
    update public.member_status_events
    set note = p_note
    where id = (
      select id from public.member_status_events
      where member_id = p_member_id
      order by changed_at desc
      limit 1
    );
  end if;

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: rejoin (§7)
--
-- Not a reactivation. A returning member goes through onboarding again from
-- scratch, so this resets the sequence anchors and the welcome session gate and
-- puts them back to 'onboarding' — never straight to 'active'.
--
-- Same row, same id: their history and their previous work stay attached to them.
-- `join_date` is left alone, so "member since" still means the first time.
--
-- A rejoin is a new contract, so the 6-month minimum term starts again from the
-- new onboarding date.
-- ---------------------------------------------------------------------------

create or replace function public.rejoin_member(
  p_member_id uuid,
  p_payment_confirmed_at timestamptz default now(),
  p_contract_signed_at timestamptz default now(),
  p_contract_term_months smallint default 6,
  p_onboarding_start_date date default current_date,
  p_contract_term_end_date date default null
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can reinstate a member';
  end if;

  if p_payment_confirmed_at is null or p_contract_signed_at is null then
    raise exception 'Payment and signed contract must both be confirmed before a member rejoins';
  end if;

  select * into v_member from public.members where id = p_member_id;

  if v_member.id is null then
    raise exception 'No member with id %', p_member_id;
  end if;

  if v_member.status <> 'cancelled' then
    raise exception 'Member % is not cancelled (status: %)', p_member_id, v_member.status;
  end if;

  update public.members
  set status = 'onboarding',
      cancelled_at = null,
      onboarding_start_date = p_onboarding_start_date,
      cohort_start_date = null,
      -- Onboarding runs again in full, welcome session included.
      welcome_session_watched_at = null,
      payment_confirmed_at = p_payment_confirmed_at,
      contract_signed_at = p_contract_signed_at,
      contract_term_months = p_contract_term_months,
      contract_term_end_date = coalesce(
        p_contract_term_end_date,
        (p_onboarding_start_date + make_interval(months => p_contract_term_months))::date
      )
  where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.create_member(uuid, text, text, timestamptz, timestamptz, smallint, date, date) from public;
revoke all on function public.cancel_member(uuid, text) from public;
revoke all on function public.rejoin_member(uuid, timestamptz, timestamptz, smallint, date, date) from public;

grant execute on function public.create_member(uuid, text, text, timestamptz, timestamptz, smallint, date, date) to authenticated;
grant execute on function public.cancel_member(uuid, text) to authenticated;
grant execute on function public.rejoin_member(uuid, timestamptz, timestamptz, smallint, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Notes carried forward to later migrations
-- ---------------------------------------------------------------------------
--
-- 1. HANDOVER PACK / ARCHIVIO (§8). A returning member's existing handover pack
--    must stay visible to them as history. Onboarding members don't normally see
--    Archivio, so its RLS needs an explicit exception: a member reads their own
--    handover pack entries whenever `has_portal_access()` is true, regardless of
--    status. Do NOT gate that table on `status = 'active'` — that would hide a
--    returning member's own past work from them. `is_returning_member()` is there
--    if the UI wants to frame it differently for them.
--
-- 2. cohort_start_date is left null at creation and at rejoin. Enrolment is closed
--    outside week 2 (§1, hard rule), so the cohort follows from the onboarding
--    start date — but the week-1-to-week-4 calendar those dates derive from
--    doesn't exist yet. Set it in the migration that adds the cadence calendar.
--
-- 3. The 6-month minimum term is reference only where ACCESS is concerned. If a
--    future feature ever wants to act on it — blocking cancellation inside the
--    minimum term, say — that's a conversation first, not a schema change: the
--    term is contractual and billed through HeyClients, and the app is not the
--    system of record for it. `contract_term_end_date` is the one exception, and
--    only because it drives the recommit milestone below, not access.
--
-- 4. THE RECOMMIT MILESTONE (at contract_term_end_date). At the 6-month mark the
--    member gets a fresh 6-month roadmap as a recommit incentive: a refreshed
--    audit first, then a live 1:1 with Nina, same shape as the original
--    onboarding call. Membership goes rolling monthly from this point.
--
--    Two things this needs from tables that don't exist yet:
--
--    a. `member_audits` (§1) — renamed from `onboarding_audit`, because the audit
--       is no longer one-time. It holds multiple submissions per member,
--       discriminated by `occasion` ('onboarding' | 'recommit'), the recommit one
--       reusing the same question structure with an updated business snapshot and
--       current pricing. Comparing the two snapshots is a feature in its own
--       right: the first point the product can show a member six months of
--       movement in their own numbers.
--
--    b. `roadmap_history.reason` (§1) — 'onboarding' | 'monthly_repoint' |
--       'recommit'. A recommit roadmap reuses the same roadmap/roadmap_history
--       tables but is a different event: a full fresh 6-month plan off the back
--       of a live call, not a routine monthly re-point.
--
--    Deliberately NOT tracked on `members`: the audit's occasion field and
--    roadmap_history's reason already carry this state. A duplicate
--    `recommit_completed_at` here would just be a second source of truth to keep
--    in sync.
