-- aOS — when a member last looked at their roadmap.
--
-- Round 6 §2 wants a nudge after seven days away from La Strada, and nothing
-- in the product could answer "away since when". `station_visits` covers the
-- eleven stations on The Map; La Strada is not a station, and the roadmap's
-- own row records when Nina last edited it, not when the member last read it.
--
-- One row per member, not per visit. The question is only "when last", and a
-- visit log would be a table growing by a row per page view to answer a
-- question one timestamp answers.
--
-- **Opening is not the only interaction** (the brief says "opened or
-- interacted"), but the others already leave dated marks of their own —
-- `roadmap_action_ticks.updated_at` and `roadmap_month_notes.updated_at` —
-- and the nudge reads the latest of all three. So this table records the one
-- thing that had no record.

create table public.roadmap_seen (
  member_id uuid primary key references public.members (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  -- Kept for the same reason station_visits keeps its count: "how often do
  -- they actually look at it" is worth knowing once there is a month of it.
  seen_count integer not null default 1
);

alter table public.roadmap_seen enable row level security;

create policy roadmap_seen_own
  on public.roadmap_seen for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy roadmap_seen_all_admin
  on public.roadmap_seen for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- Recording it
--
-- A function rather than an upsert from the app, as with `record_station_visit`
-- and for the same reason: the increment and the timestamp belong in one
-- statement, so two loads racing can't lose a count. There is deliberately no
-- member INSERT/UPDATE policy — this function is the only way in, so a member
-- cannot backdate their own last-seen to duck the nudge.
-- ---------------------------------------------------------------------------

create or replace function public.record_roadmap_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A cancelled member reaches nothing, so a visit from one is a bug
  -- elsewhere; returning quietly keeps a page render from failing over
  -- something this incidental.
  if not public.has_portal_access() then
    return;
  end if;

  insert into public.roadmap_seen (member_id)
  values ((select auth.uid()))
  on conflict (member_id) do update
    set last_seen_at = now(),
        seen_count = public.roadmap_seen.seen_count + 1;
end;
$$;

revoke all on function public.record_roadmap_seen() from public;
grant execute on function public.record_roadmap_seen() to authenticated;

-- The nudge itself, queued by the daily cron like every other reminder.
alter type public.due_job_kind add value if not exists 'roadmap_idle';
