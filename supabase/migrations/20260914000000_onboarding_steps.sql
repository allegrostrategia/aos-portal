-- aOS — the member's own ticks on the six onboarding steps.
--
-- L'Editoriale redesign brief, §7: the onboarding sequence is a section at
-- the top of Piazza that "stays visible until all six steps are genuinely
-- complete — not gated on the member's onboarding/active status field, since
-- some steps (the roadmap arriving, the first hot seat) can complete after
-- status has already flipped to active. Needs its own completion tracking
-- across the six steps, independent of the status column."
--
-- Most of the six already have a source of truth — a submitted audit, the
-- welcome timestamp, signed-off weeks, a confirmed roadmap, a hot-seat
-- submission — and those are *derived*, not copied here; a copy is a thing
-- that can disagree with the fact. This table is for the steps that have no
-- fact behind them in the product: "I've booked my 1:1" is something only the
-- member knows. One row per step the member has ticked.
--
-- Nothing here reads `members.status`. That is the whole point.

create table public.onboarding_steps (
  member_id uuid not null references public.members (id) on delete cascade,
  step text not null check (step in ('form', 'video', 'tracking', 'call', 'roadmap', 'hot_seat')),
  completed_at timestamptz not null default now(),

  primary key (member_id, step)
);

alter table public.onboarding_steps enable row level security;

create policy onboarding_steps_select_own
  on public.onboarding_steps for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy onboarding_steps_insert_own
  on public.onboarding_steps for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

-- A tick can be taken back. Redundant with select for the same reason as
-- every other delete policy here, and kept for the same reason.
create policy onboarding_steps_delete_own
  on public.onboarding_steps for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy onboarding_steps_all_admin
  on public.onboarding_steps for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
