-- aOS — hours reclaimed (Step 10, Build Brief §2).
--
-- The product's headline metric, and the thing its core promise is measured by.
-- Two tables, because §2 is specific about the shape and the shape is the point:
--
--   · a dated rate history per build, so revising an estimate opens a new period
--     rather than overwriting the old one
--   · an append-only weekly ledger, so the running total is a record of what was
--     earned week by week rather than a number recalculated from today's rates
--
-- The difference matters the first time a rate changes. With a live calculation,
-- retiring a build that ran for six months would erase six months of banked
-- hours retroactively — a member watching their headline number fall because
-- something they built stopped being counted. §2 forbids exactly that: "already
-- accrued hours never retroactively shrink."

-- ---------------------------------------------------------------------------
-- What a build saves, and when it saved it
--
-- Generated per handover pack entry as a weekly rate (§2), drafted at hot seat
-- prep from the member's own tracked category hours and confirmed by Nina before
-- it is locked. The rate row existing IS that confirmation — nothing accrues
-- from a build until somebody decides what it's worth.
-- ---------------------------------------------------------------------------

create table public.handover_pack_rates (
  id uuid primary key default gen_random_uuid(),
  handover_pack_id uuid not null
    references public.handover_pack (id) on delete cascade,

  -- Hours per week this build gives back. Numeric rather than integer: "2.5
  -- hours a week" is a normal answer and rounding it up would inflate the
  -- headline number, which is the one number that has to be trustworthy.
  hours_per_week numeric(5, 2) not null check (hours_per_week >= 0),

  effective_from date not null,
  -- Null means still running. Closing a period is how a build is retired (§2) —
  -- the natural extension of the two-week check-in, not a delete.
  effective_until date,

  drafted_by public.drafted_by not null default 'nina',
  note text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint handover_pack_rates_period_ordered
    check (effective_until is null or effective_until > effective_from)
);

-- A build can have many historical periods but only one open one. Without this,
-- correcting a rate twice would leave two open periods and double-count the
-- build in every week from then on.
create unique index handover_pack_rates_one_open_period
  on public.handover_pack_rates (handover_pack_id)
  where effective_until is null;

create index handover_pack_rates_pack_idx
  on public.handover_pack_rates (handover_pack_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- The ledger
--
-- Append-only, one row per member per qualifying week, same pattern as
-- member_status_events and roadmap_history. `unique (member_id, week_start_date)`
-- is what makes the weekly job safe to re-run and safe to backfill — the build
-- plan is explicit that a failed run must not silently cost members hours they
-- had earned, and re-running is the recovery.
--
-- `breakdown` keeps what the number was made of at the time. A member asking
-- "why was that week 8 hours" deserves an answer that doesn't depend on today's
-- rates still being what they were then.
-- ---------------------------------------------------------------------------

create table public.hours_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- Monday of the week earned, matching weekly_time_totals.
  week_start_date date not null,

  hours numeric(6, 2) not null check (hours >= 0),

  -- [{ "handover_pack_id": ..., "title": ..., "hours_per_week": ... }, ...]
  breakdown jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  unique (member_id, week_start_date)
);

create index hours_ledger_member_idx
  on public.hours_ledger (member_id, week_start_date desc);

-- ---------------------------------------------------------------------------
-- Accrual
--
-- Two gates, both from §2, and they are not the same gate:
--   · the week must be a qualifying week — the same 10 hours that decides draw
--     eligibility, one bar with one meaning
--   · the member must have submitted that week's log — accrual reinforces the
--     weekly habit rather than running silently in the background
--
-- Requiring both is the literal reading of §2, which states them as separate
-- bullets. It means a member who tracks twelve hours and forgets to submit earns
-- nothing that week, which is deliberate but worth Nina knowing out loud.
--
-- A rate counts for a week if it was in effect on the Monday. A build confirmed
-- mid-week therefore starts paying from the following week — the alternative is
-- part-weeks, and a build that existed for two days of a week did not save
-- anybody a week's worth of time.
--
-- Returns the hours written, or null if the week didn't qualify. Idempotent: a
-- second call for a week already in the ledger changes nothing and returns what
-- is already there.
-- ---------------------------------------------------------------------------

create or replace function public.accrue_hours_for_week(
  p_member_id uuid,
  p_week_start date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing numeric;
  v_minutes integer;
  v_submitted boolean;
  v_hours numeric;
  v_breakdown jsonb;
begin
  -- Admins, and the cron, which runs with the service role and so has no JWT of
  -- its own. Members never call this: accrual is machine work, not a button, and
  -- a member able to run it could mint their own hours.
  if not (public.is_portal_admin() or (select auth.uid()) is null) then
    raise exception 'Only an admin can accrue hours';
  end if;

  select hours into v_existing
  from public.hours_ledger
  where member_id = p_member_id and week_start_date = p_week_start;

  if v_existing is not null then
    return v_existing;
  end if;

  select coalesce(sum(duration_minutes), 0)::integer into v_minutes
  from public.time_entries
  where member_id = p_member_id
    and ended_at is not null
    and (date_trunc('week', started_at))::date = p_week_start;

  select submitted_at is not null into v_submitted
  from public.weekly_submissions
  where member_id = p_member_id and week_start_date = p_week_start;

  if v_minutes < 600 or coalesce(v_submitted, false) = false then
    return null;
  end if;

  select coalesce(sum(r.hours_per_week), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'handover_pack_id', h.id,
               'title', h.title,
               'hours_per_week', r.hours_per_week
             )
             order by h.title
           ),
           '[]'::jsonb
         )
    into v_hours, v_breakdown
  from public.handover_pack_rates r
  join public.handover_pack h on h.id = r.handover_pack_id
  where h.member_id = p_member_id
    and r.effective_from <= p_week_start
    and (r.effective_until is null or r.effective_until > p_week_start);

  -- A qualifying week with no active build earns nothing, and that is a real
  -- zero rather than a missing week. Writing it keeps the ledger a complete
  -- record of which weeks qualified, which is what makes a gap mean "the job
  -- didn't run" rather than "there was nothing to add".
  insert into public.hours_ledger (member_id, week_start_date, hours, breakdown)
  values (p_member_id, p_week_start, v_hours, v_breakdown)
  on conflict (member_id, week_start_date) do nothing;

  return v_hours;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setting and retiring a rate
--
-- Functions rather than two statements from the admin panel, because closing one
-- period and opening the next has to be one operation. The partial unique index
-- stops two open periods existing, so a half-completed revision from the app
-- would leave a build with *no* open rate — silently earning nothing from the
-- next week on, which nobody would notice until a member asked why their number
-- had stopped moving.
-- ---------------------------------------------------------------------------

create or replace function public.set_build_rate(
  p_handover_pack_id uuid,
  p_hours_per_week numeric,
  p_effective_from date,
  p_note text default null
)
returns public.handover_pack_rates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.handover_pack_rates;
  v_new public.handover_pack_rates;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can set what a build is worth';
  end if;

  if p_hours_per_week is null or p_hours_per_week < 0 then
    raise exception 'A rate is hours per week, and cannot be negative';
  end if;

  select * into v_open
  from public.handover_pack_rates
  where handover_pack_id = p_handover_pack_id and effective_until is null;

  -- Correcting a rate on the day it was set is a correction, not history: there
  -- is no closed period worth keeping for a rate that was never in effect for a
  -- single week. Anything later opens a genuine new period.
  if v_open.id is not null and v_open.effective_from = p_effective_from then
    update public.handover_pack_rates
    set hours_per_week = p_hours_per_week,
        note = coalesce(p_note, note),
        created_by = (select auth.uid())
    where id = v_open.id
    returning * into v_new;
    return v_new;
  end if;

  if v_open.id is not null then
    if p_effective_from <= v_open.effective_from then
      raise exception 'A new rate has to start after the one it replaces';
    end if;

    update public.handover_pack_rates
    set effective_until = p_effective_from
    where id = v_open.id;
  end if;

  insert into public.handover_pack_rates
    (handover_pack_id, hours_per_week, effective_from, note, created_by)
  values
    (p_handover_pack_id, p_hours_per_week, p_effective_from, p_note,
     (select auth.uid()))
  returning * into v_new;

  return v_new;
end;
$$;

/*
 * Retiring a build (§2): close the open period and open nothing after it.
 *
 * Everything already in the ledger stays exactly as it is. That is the whole
 * reason the ledger is append-only — retiring a build that ran for six months
 * must not erase six months of banked hours.
 */
create or replace function public.retire_build_rate(
  p_handover_pack_id uuid,
  p_effective_until date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.handover_pack_rates;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can retire a build';
  end if;

  select * into v_open
  from public.handover_pack_rates
  where handover_pack_id = p_handover_pack_id and effective_until is null;

  if v_open.id is null then
    raise exception 'That build has no rate currently running';
  end if;

  if p_effective_until <= v_open.effective_from then
    raise exception 'A build cannot stop earning before it started';
  end if;

  update public.handover_pack_rates
  set effective_until = p_effective_until
  where id = v_open.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.handover_pack_rates enable row level security;
alter table public.hours_ledger enable row level security;

-- A member sees what their own builds are worth. has_portal_access() rather than
-- an active-only gate, for the same reason handover_pack uses it: a member who
-- cancelled and rejoined sits in `onboarding` while their own history stays
-- theirs (rule 6).
create policy handover_pack_rates_select_own
  on public.handover_pack_rates for select
  to authenticated
  using (
    public.has_portal_access()
    and exists (
      select 1 from public.handover_pack h
      where h.id = handover_pack_id
        and h.member_id = (select auth.uid())
    )
  );

create policy handover_pack_rates_all_admin
  on public.handover_pack_rates for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy hours_ledger_select_own
  on public.hours_ledger for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- No member insert or update policy at all. The ledger is the headline number;
-- a member able to write to it could award themselves any total they liked.
create policy hours_ledger_all_admin
  on public.hours_ledger for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

revoke all on function public.accrue_hours_for_week(uuid, date) from public;
revoke all on function public.set_build_rate(uuid, numeric, date, text) from public;
revoke all on function public.retire_build_rate(uuid, date) from public;

grant execute on function public.accrue_hours_for_week(uuid, date) to authenticated;
grant execute on function public.set_build_rate(uuid, numeric, date, text) to authenticated;
grant execute on function public.retire_build_rate(uuid, date) to authenticated;
