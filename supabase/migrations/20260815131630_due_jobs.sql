-- aOS — the due-jobs queue.
--
-- One piece of scheduling infrastructure for three consumers:
--   · the weekly log reminders (§4)
--   · the hours-reclaimed weekly ledger (§2, Step 10)
--   · the two-week build check-ins (§2, Step 11)
--
-- They don't share a cadence — reminders and the ledger are calendar-driven,
-- check-ins fire on a per-build offset — so they can't share a cron schedule.
-- What they share is the shape: something is due for someone on a date, it runs
-- once, and it must be safe to run again.
--
-- Vercel's Hobby plan runs cron once a day, which is exactly enough: the cron
-- only ever asks "what's due on or before today", and the table holds whatever
-- precision the work actually needs.

create type public.due_job_kind as enum (
  'log_reminder_midweek',
  'log_reminder_endweek',
  'hours_ledger_week',   -- Step 10, not yet dispatched
  'build_check_in'       -- Step 11, not yet dispatched
);

create type public.due_job_status as enum (
  'pending',
  'done',
  'skipped',  -- ran, decided there was nothing to do (member caught up, say)
  'failed'
);

create table public.due_jobs (
  id uuid primary key default gen_random_uuid(),

  kind public.due_job_kind not null,

  -- Every consumer so far is per-member. Nullable anyway, so a future
  -- whole-cohort job doesn't need a schema change to exist.
  member_id uuid references public.members (id) on delete cascade,

  -- The day this becomes runnable. A date, not a timestamp: the cron runs daily,
  -- and pretending to minute precision we can't deliver would be a lie in the
  -- schema.
  due_on date not null,

  -- What makes this safe to plan repeatedly. Each kind builds its own, e.g.
  -- 'log_reminder_midweek:<member>:2026-08-17'. The planner runs every day and
  -- inserts on conflict do nothing, so a job can't be queued twice however many
  -- times planning happens.
  dedupe_key text not null unique,

  payload jsonb not null default '{}'::jsonb,

  status public.due_job_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

-- The runner's only query: what's still pending and due. `due_on <= today`
-- rather than `= today`, so a day the cron didn't run is caught up on the next
-- one rather than silently lost — which for the hours ledger would mean members
-- losing hours they had earned.
create index due_jobs_pending_idx
  on public.due_jobs (due_on)
  where status = 'pending';

create index due_jobs_member_idx on public.due_jobs (member_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Operational plumbing, not member content. The runner uses the service role and
-- bypasses RLS entirely; admins can read it to see what fired and what failed.
-- Members have no policy at all — there's nothing here they need.
-- ---------------------------------------------------------------------------

alter table public.due_jobs enable row level security;

create policy due_jobs_select_admin
  on public.due_jobs for select
  to authenticated
  using (public.is_portal_admin());
