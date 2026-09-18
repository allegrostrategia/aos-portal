-- aOS — La Strada: the member's roadmap page (docs/aOS_LaStrada_Roadmap_Brief.md).
--
-- The roadmap's structure (months → focuses → actions, each action with an
-- optional week of its month) already holds what the page shows. Three things
-- it does not hold:
--
--   1. WHEN month 1 is. Months were positional and weeks were "week 2 of the
--      month" with no month named, which was enough for the weekly log (it
--      only ever needs "this week"). A page that prints "Week 6 of 24" and
--      "12 to 18 Oct" needs an anchor. `starts_on` is the first Monday of
--      month 1. Set when the roadmap is started; editable.
--
--   2. Whether an action is DONE, as a state of the action. The weekly log
--      records "which actions did you do this week" per signed-off week, and
--      a signed-off week is locked. A tick on La Strada is about the action,
--      not the week, and a member ticks past weeks' actions from the plan
--      itself. So: a tick per action, which overrides what the log implies.
--      Reading order on the page: an explicit tick here, else "ticked in any
--      week's log", else not done.
--
--   3. "Off the itinerary": one free-text note per member per roadmap month,
--      for real work that wasn't on the plan. New in the brief.
--
-- Bucket (Visibility / Launch / Systems / Profit) on an action lives in the
-- jsonb beside week and training; no column needed.

alter table public.roadmap
  add column starts_on date
    check (starts_on is null or extract(isodow from starts_on) = 1);

comment on column public.roadmap.starts_on is
  'The Monday week 1 of month 1 begins: the first Monday of that calendar month. Weeks and month boundaries on La Strada are counted from it. Null on roadmaps from before 18 Sep 2026; the page then falls back to the month after confirmation.';

-- ---------------------------------------------------------------------------
-- Ticks
-- ---------------------------------------------------------------------------

create table public.roadmap_action_ticks (
  roadmap_id uuid not null references public.roadmap (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- The action's id inside roadmap.phases: the same key the weekly log's
  -- actions_taken and roadmap_action_notes use, so all three refer to one thing.
  action_id text not null,
  done boolean not null,
  updated_at timestamptz not null default now(),
  primary key (roadmap_id, action_id)
);

create index roadmap_action_ticks_member_idx
  on public.roadmap_action_ticks (member_id);

create trigger roadmap_action_ticks_set_updated_at
  before update on public.roadmap_action_ticks
  for each row
  execute function public.set_updated_at();

alter table public.roadmap_action_ticks enable row level security;

-- The member's own, on their own roadmap; while they have access. An admin
-- reads all and may tick on a member's behalf from edit mode.
create policy roadmap_action_ticks_own
  on public.roadmap_action_ticks for all
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.roadmap r
      where r.id = roadmap_id and r.member_id = (select auth.uid())
    )
  );

create policy roadmap_action_ticks_admin
  on public.roadmap_action_ticks for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- Off the itinerary
-- ---------------------------------------------------------------------------

create table public.roadmap_month_notes (
  roadmap_id uuid not null references public.roadmap (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  month smallint not null check (month between 1 and 6),
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (roadmap_id, month)
);

create trigger roadmap_month_notes_set_updated_at
  before update on public.roadmap_month_notes
  for each row
  execute function public.set_updated_at();

alter table public.roadmap_month_notes enable row level security;

-- The member writes their own. Nina reads them (the prep sheet and the
-- reveal both want to know what happened off the plan); she doesn't write
-- them, since they are the member's account of their month.
create policy roadmap_month_notes_own
  on public.roadmap_month_notes for all
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.roadmap r
      where r.id = roadmap_id and r.member_id = (select auth.uid())
    )
  );

create policy roadmap_month_notes_admin_read
  on public.roadmap_month_notes for select
  to authenticated
  using (public.is_portal_admin());
