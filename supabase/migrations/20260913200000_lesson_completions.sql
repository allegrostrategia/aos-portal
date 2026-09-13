-- aOS — which lessons a member has marked as complete.
--
-- L'Editoriale redesign brief, §2: "a real 'mark as complete' tracker — per
-- member, per lesson, saved and persisted, not a UI-only tick that resets on
-- refresh."
--
-- Deliberately a member's own claim, not a measurement. Nothing here knows
-- whether the video was watched; it records that the member said they were done
-- with it, which is what a tick on a lesson has always meant. So, unlike
-- station_visits, the member writes this table directly — and can untick,
-- because a tick they put there is theirs to take back. Rule 6 ("nothing is
-- ever deleted") protects the member's record from the *product*; it does not
-- turn a checkbox into a ratchet.

create table public.lesson_completions (
  member_id uuid not null references public.members (id) on delete cascade,
  content_id uuid not null references public.training_content (id) on delete cascade,
  completed_at timestamptz not null default now(),

  primary key (member_id, content_id)
);

create index lesson_completions_member_idx on public.lesson_completions (member_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lesson_completions enable row level security;

create policy lesson_completions_select_own
  on public.lesson_completions for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- The content must be something they can see. training_content's own RLS
-- runs inside this subquery as the member, so an unpublished draft, or a lesson
-- outside the onboarding starter set, is simply not there to be ticked — no
-- second copy of the tiering rules needed here.
create policy lesson_completions_insert_own
  on public.lesson_completions for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and exists (select 1 from public.training_content c where c.id = content_id)
  );

-- Both clauses here are redundant with the select policy above — a DELETE can
-- only reach rows that SELECT exposes, so a mutation that drops them survives
-- the tests. Kept on purpose: if the select policy is ever widened (say, to let
-- a coach see completions), this is what stops that also widening deletion.
create policy lesson_completions_delete_own
  on public.lesson_completions for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- No update policy: a completion is inserted or removed, never edited. The
-- timestamp is when they ticked it, and that is not a thing to revise.

create policy lesson_completions_all_admin
  on public.lesson_completions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
