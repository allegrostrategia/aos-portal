-- aOS — the weekly log: live time tracking and the weekly submission.
--
-- Build Brief §4 (Weekly log), §3 (Daily time tracking shortcut).
--
-- Two tables, because the brief describes two genuinely different things. Time is
-- logged LIVE, in real time, with a start/stop timer through the day — explicitly
-- not a retrospective weekly guess (§3/§4). The weekly submission is the dated log
-- entry the member writes: a ship's log, not a generic form.

create type public.time_entry_source as enum (
  'timer',   -- started and stopped live, the intended path
  'manual'   -- typed in after the fact; they forgot to start the timer
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  category_slug text not null references public.time_categories (slug),

  started_at timestamptz not null,
  -- Null while the timer is still running.
  ended_at timestamptz,

  note text,
  source public.time_entry_source not null default 'timer',

  -- Derived, so a running total can never drift from the entries behind it.
  duration_minutes integer generated always as (
    case
      when ended_at is null then null
      else floor(extract(epoch from (ended_at - started_at)) / 60)::integer
    end
  ) stored,

  created_at timestamptz not null default now(),

  constraint time_entries_end_after_start check (ended_at is null or ended_at > started_at)
);

-- One running timer per member. The floating global timer this is forked from is
-- a single control, so two live entries at once would be a bug with no UI to
-- resolve it.
create unique index time_entries_one_running_per_member_idx
  on public.time_entries (member_id)
  where ended_at is null;

create index time_entries_member_started_idx
  on public.time_entries (member_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Weekly totals
--
-- A view, not a stored total. §4 makes 10 logged hours the definition of a
-- completed week and the threshold for draw eligibility, so this number decides
-- whether someone is in the draw — it needs to be derived from the entries every
-- time, not maintained alongside them where it can quietly go wrong.
--
-- security_invoker so the querying member's own RLS on time_entries applies;
-- without it the view would run as its owner and leak every member's hours.
-- ---------------------------------------------------------------------------

create view public.weekly_time_totals
with (security_invoker = true) as
  select
    member_id,
    (date_trunc('week', started_at))::date as week_start_date,  -- ISO week, Monday
    sum(duration_minutes)::integer as logged_minutes,
    -- 10 hours = a completed week (§4).
    (sum(duration_minutes) >= 600) as is_complete_week
  from public.time_entries
  where ended_at is not null
  group by member_id, (date_trunc('week', started_at))::date;

-- ---------------------------------------------------------------------------
-- The weekly submission
--
-- One flexible table across the member's whole lifecycle (§1): during onboarding
-- weeks 2-3 only the time tracking is populated, since there's no roadmap yet for
-- actions-taken to reference. Same shape throughout, fields populate by stage.
-- ---------------------------------------------------------------------------

create table public.weekly_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- Monday of the week being logged.
  week_start_date date not null,

  -- The checklist against specific roadmap items: which were actioned this week.
  -- Shape: { "<roadmap item id or key>": true, ... }. Empty during onboarding.
  actions_taken jsonb not null default '{}'::jsonb,

  -- The free-response box for anything that happened outside the plan (§4).
  other_activity text,

  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, week_start_date)
);

-- NOTE: the monthly challenge is deliberately NOT a column here. §4 is explicit
-- that it is confirmed during Nina's hot seat prep review and merely displayed in
-- the log — never edited from this screen. It belongs to the hot seat tables
-- (Step 6); this table references it by month when those exist.

create index weekly_submissions_member_week_idx
  on public.weekly_submissions (member_id, week_start_date desc);

create trigger weekly_submissions_set_updated_at
  before update on public.weekly_submissions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.time_entries enable row level security;
alter table public.weekly_submissions enable row level security;

-- Time tracking is open from day one, during onboarding as well as active life
-- (§1), so these gate on has_portal_access() rather than active status.
create policy time_entries_select_own
  on public.time_entries for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy time_entries_insert_own
  on public.time_entries for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

create policy time_entries_update_own
  on public.time_entries for update
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()));

-- Members can delete their own entries — a timer left running overnight is a real
-- and common mistake, and correcting it isn't destroying a record of anything.
create policy time_entries_delete_own
  on public.time_entries for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy time_entries_all_admin
  on public.time_entries for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy weekly_submissions_select_own
  on public.weekly_submissions for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy weekly_submissions_insert_own
  on public.weekly_submissions for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

-- Editable until submitted, then fixed — it's a dated log entry, not a document
-- that keeps changing after the fact.
create policy weekly_submissions_update_own_unsubmitted
  on public.weekly_submissions for update
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and submitted_at is null
  )
  with check (member_id = (select auth.uid()));

create policy weekly_submissions_all_admin
  on public.weekly_submissions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
