-- aOS — the hot seat.
--
-- Build Brief §5, plus the challenge mechanic in §3.
--
-- One fixed monthly group slot, week 1, everyone in it together. Not bookable,
-- not personalised — whoever shows up gets worked on live. Five minutes is a
-- guaranteed minimum per person rather than a fixed slot, so a quiet month
-- means more time each rather than a shorter session.
--
-- Pod-splitting past 12 attendees is deliberately absent: §5 leaves it
-- undecided, and a guess here would be a guess in the schema.

create table public.hot_seat_sessions (
  id uuid primary key default gen_random_uuid(),

  -- First day of the month this session belongs to. Week 1 of every month, so
  -- the month identifies the session (§1).
  session_month date not null unique,

  -- When it actually runs. Null until Nina sets it — the cadence says week 1,
  -- the exact slot is hers.
  scheduled_for timestamptz,

  -- Nina provides the link (§5). Per-session rather than a single standing
  -- setting: a standing link is just the same value each month, but a schema
  -- with one field per session can express both, and one global setting can't
  -- express a one-off change.
  zoom_url text,

  -- Where the clipped replays end up once they're produced — a manual step
  -- after the call, not automatic (§5).
  replay_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint hot_seat_sessions_month_is_first
    check (extract(day from session_month) = 1)
);

create trigger hot_seat_sessions_set_updated_at
  before update on public.hot_seat_sessions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Submissions
--
-- The pre-submission → AI prep → confirm sequence (§5). What the member writes,
-- what Claude drafts from it, and what Nina locks in — three distinct things,
-- kept in three distinct columns so it stays visible which is which.
-- ---------------------------------------------------------------------------

create table public.hot_seat_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,

  -- In the member's own words (§5). Their tracked time for the month is pulled
  -- automatically at prep time and needs no form.
  challenge text,
  already_tried text,
  done_looks_like text,

  submitted_at timestamptz,

  -- What Claude drafted from the tracked data, the answers above, their handover
  -- pack (so nothing is suggested twice) and their La Strada position. Kept
  -- separately from the confirmed version, so "did Nina take the draft or change
  -- it" stays answerable — which is the only honest way to know whether the
  -- drafting is any good yet.
  suggested_challenge text,
  drafted_at timestamptz,

  -- The locked challenge going into the session, and what displays on Piazza
  -- afterward (§3). Set during Nina's existing pre-call review, never live.
  confirmed_challenge text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  -- Whether the confirmed text is Claude's draft as-is, or Nina's adjustment.
  drafted_by public.drafted_by,

  attended boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id, member_id)
);

create index hot_seat_submissions_member_idx
  on public.hot_seat_submissions (member_id, created_at desc);

create index hot_seat_submissions_session_idx
  on public.hot_seat_submissions (session_id);

create trigger hot_seat_submissions_set_updated_at
  before update on public.hot_seat_submissions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reminder job kinds (§5, two tracks)
--
-- Submission: 7 days out, 2 days before the deadline for non-submitters only,
-- and a day-of final nudge. Attendance: the day before, and the morning of.
-- Added to the existing due_jobs vocabulary rather than a second scheduler.
-- ---------------------------------------------------------------------------

alter type public.due_job_kind add value if not exists 'hot_seat_submit_7d';
alter type public.due_job_kind add value if not exists 'hot_seat_submit_2d';
alter type public.due_job_kind add value if not exists 'hot_seat_submit_final';
alter type public.due_job_kind add value if not exists 'hot_seat_attend_1d';
alter type public.due_job_kind add value if not exists 'hot_seat_attend_am';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.hot_seat_sessions enable row level security;
alter table public.hot_seat_submissions enable row level security;

-- Everyone with access sees the session itself — the date and the link are part
-- of the furniture, and an onboarding member seeing what's coming is the point
-- of the trailer replays too (§1).
create policy hot_seat_sessions_select_member
  on public.hot_seat_sessions for select
  to authenticated
  using (public.has_portal_access());

create policy hot_seat_sessions_all_admin
  on public.hot_seat_sessions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy hot_seat_submissions_select_own
  on public.hot_seat_submissions for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- Hot seat is locked until active (§1) — an onboarding member has no roadmap
-- and no challenge yet, which is what the session is built around.
create policy hot_seat_submissions_insert_own
  on public.hot_seat_submissions for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.is_active_member());

-- Editable until Nina locks it. After confirmation the challenge is what goes
-- into the room, and a member rewriting it afterwards would desync the session
-- from what Nina prepared (§3).
create policy hot_seat_submissions_update_own_unconfirmed
  on public.hot_seat_submissions for update
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.is_active_member()
    and confirmed_at is null
  )
  with check (member_id = (select auth.uid()));

create policy hot_seat_submissions_all_admin
  on public.hot_seat_submissions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
