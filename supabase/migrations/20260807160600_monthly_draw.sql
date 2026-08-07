-- aOS — the monthly draw.
--
-- Build Brief §2 (The monthly draw), §4 (Completed week), §1 (Locked until active).
--
-- Eligibility is earned, not given: a full month of completed check-ins, where a
-- completed week means 10 logged hours (§4). Onboarding members aren't eligible —
-- the draw rewards the habit the membership is actually built on.

create table public.draws (
  id uuid primary key default gen_random_uuid(),

  -- First day of the month this draw belongs to.
  draw_month date not null unique,
  prize text not null,
  draw_date date not null,

  winner_member_id uuid references public.members (id) on delete set null,
  drawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint draws_month_is_first_of_month check (extract(day from draw_month) = 1)
);

create table public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,

  -- How many complete weeks earned the entry, recorded at the point of entry.
  -- Kept because the underlying time entries can be edited afterwards, and a past
  -- draw shouldn't silently re-decide who was in it.
  complete_weeks smallint,

  entered_at timestamptz not null default now(),

  unique (draw_id, member_id)
);

create index draw_entries_member_idx on public.draw_entries (member_id);

create trigger draws_set_updated_at
  before update on public.draws
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Eligibility
--
-- Counts the member's completed weeks in a given month, using the same 10-hour
-- definition as the weekly log. Admin calls this when running the draw rather
-- than eligibility being a flag someone has to remember to maintain.
--
-- A week counts towards the month its Monday falls in — simpler than apportioning
-- split weeks, and the threshold is generous enough that the edge doesn't matter.
-- ---------------------------------------------------------------------------

create or replace function public.complete_weeks_in_month(
  p_member_id uuid,
  p_month date
)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::integer
  from (
    select (date_trunc('week', started_at))::date as week_start_date,
           sum(duration_minutes) as logged_minutes
    from public.time_entries
    where member_id = p_member_id
      and ended_at is not null
    group by 1
  ) w
  where w.logged_minutes >= 600
    and date_trunc('month', w.week_start_date) = date_trunc('month', p_month);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.draws enable row level security;
alter table public.draw_entries enable row level security;

-- Everyone with access sees the draw itself — this month's prize and date are
-- part of the furniture, and the Piazza card shows them whether or not the
-- member is entered (§2).
create policy draws_select_member
  on public.draws for select
  to authenticated
  using (public.has_portal_access());

create policy draws_all_admin
  on public.draws for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- A member sees their own entry status, not the full entrant list.
create policy draw_entries_select_own
  on public.draw_entries for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- Entries are created by admin when the draw is run, never by members.
create policy draw_entries_all_admin
  on public.draw_entries for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
