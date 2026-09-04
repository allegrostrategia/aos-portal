-- aOS — a comment box per roadmap action (3 Sep).
--
-- The weekly log has one free-text box for a whole week. That was fine when the
-- roadmap was a flat list; now that an action names a specific thing in a
-- specific week, "how did it go" is a question about the action, not the week.
--
-- Its own table rather than another key in `weekly_submissions.actions_taken`.
-- That column is a tick per action and answers "did you do it"; this answers
-- "what happened", which outlives the week it was asked in — a note written in
-- March is still the reason an action stalled when Nina reads it in June.
--
-- One note per action, edited in place rather than appended to. A member coming
-- back to say "actually it's working now" should be updating what they said,
-- not leaving two contradictory notes for Nina to reconcile.

create table public.roadmap_action_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  roadmap_id uuid not null references public.roadmap (id) on delete cascade,

  -- The action's id inside `roadmap.phases`. Text rather than a foreign key,
  -- because the actions live in jsonb — and deliberately the same id the weekly
  -- log's `actions_taken` keys off, so a tick and a note refer to one thing.
  action_id text not null,

  body text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (roadmap_id, action_id)
);

create index roadmap_action_notes_member_idx
  on public.roadmap_action_notes (member_id, updated_at desc);

create trigger roadmap_action_notes_set_updated_at
  before update on public.roadmap_action_notes
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- The member writes these and Nina reads them — the same shape as the two-week
-- check-in, and for the same reason: she is deciding what to do next from what
-- they actually said, not from a guess.
--
-- `has_portal_access()` rather than active-only, so a member who cancelled and
-- rejoined can still read what they wrote before they left.
-- ---------------------------------------------------------------------------

alter table public.roadmap_action_notes enable row level security;

create policy roadmap_action_notes_select_own
  on public.roadmap_action_notes for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy roadmap_action_notes_write_own
  on public.roadmap_action_notes for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

create policy roadmap_action_notes_update_own
  on public.roadmap_action_notes for update
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()));

-- Clearing a note is a real intent, not an edge case: something written in
-- frustration and thought better of shouldn't need Nina to remove. Same
-- reasoning as a member deleting their own SOP — rule 6 protects the record of
-- their membership, not every sentence they ever typed.
--
-- Without this the delete doesn't error, it matches nothing — so the note stays
-- and the screen says it's gone.
create policy roadmap_action_notes_delete_own
  on public.roadmap_action_notes for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy roadmap_action_notes_all_admin
  on public.roadmap_action_notes for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- The column-ownership trap, checked before it bites rather than after: the
-- update policy grants the member their own row, and RLS is row-level, so
-- without this they could move a note onto another roadmap or another action —
-- reattaching what they said about one thing to a different one.
create or replace function public.guard_roadmap_note_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() then
    return new;
  end if;

  if new.member_id is distinct from old.member_id
     or new.roadmap_id is distinct from old.roadmap_id
     or new.action_id is distinct from old.action_id
  then
    raise exception 'A note stays attached to the action it was written about';
  end if;

  return new;
end;
$$;

create trigger roadmap_action_notes_guard_member_update
  before update on public.roadmap_action_notes
  for each row
  execute function public.guard_roadmap_note_member_update();
