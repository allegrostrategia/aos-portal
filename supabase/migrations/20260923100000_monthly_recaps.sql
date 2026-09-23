-- aOS — the monthly recap.
--
-- Brief: docs/aOS_Monthly_Recap_Brief.md. The same shape as the roadmap and the
-- reveal document: the app collates the month's real data, Nina drafts the
-- writing with Claude outside the product, and the finished text is pasted back
-- in here. Nothing in this file or anything reading it calls an AI (rule 2).
--
-- One row per member per month. The body is nullable because it is pasted in
-- over more than one sitting — the reveal made the same allowance, for the same
-- reason: a form that refuses a half-finished draft is a form somebody
-- abandons with the good phrasing still in their notes.
--
-- Three timestamps, three states, and the difference between them matters:
--
--   · nothing        — Nina is still working on it. The member cannot read it.
--   · sent_at        — the email has gone and the card is on their Piazza.
--   · opened_at      — they have actually read it (Dom, 23 Sep: a real read
--                      timestamp, the same pattern as chat, rather than
--                      assuming a send is a read). This is what takes the card
--                      off Piazza, and what tells Nina it landed.

create table public.monthly_recaps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- First day of the month being written up.
  recap_month date not null,

  -- Nina's finished text, drafted outside the app and pasted in.
  body text,

  sent_at timestamptz,
  opened_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, recap_month),
  constraint monthly_recaps_month_is_first check (extract(day from recap_month) = 1),
  -- An unsent recap cannot have been read, and the read policy leans on this.
  constraint monthly_recaps_opened_after_sent check (opened_at is null or sent_at is not null)
);

create index monthly_recaps_member_idx
  on public.monthly_recaps (member_id, recap_month desc);

create trigger monthly_recaps_set_updated_at
  before update on public.monthly_recaps
  for each row
  execute function public.set_updated_at();

alter table public.monthly_recaps enable row level security;

-- ---------------------------------------------------------------------------
-- RLS
--
-- A member reads their own, and only once it has been sent: a draft in
-- progress is Nina's working copy, and a policy that let them read it early
-- would show them half a sentence about themselves. `has_portal_access()` is
-- the cancellation gate (rule 7) — the rows stay, the access goes.
-- ---------------------------------------------------------------------------

create policy monthly_recaps_select_own
  on public.monthly_recaps for select
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and sent_at is not null
  );

-- Marking it read. The column-level restriction is the trigger below; RLS is
-- row-level and cannot express "only this column" on its own — the trap three
-- other tables here have already fallen into.
create policy monthly_recaps_update_own
  on public.monthly_recaps for update
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and sent_at is not null
  )
  with check (member_id = (select auth.uid()));

create policy monthly_recaps_all_admin
  on public.monthly_recaps for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- A member may say they read it, and nothing else
--
-- Without this, the update policy above hands them every column: the body
-- about themselves, and `sent_at`, which decides whether it is theirs to read
-- at all. The service role passes (`auth.uid()` is null) for the same reason
-- the pairing guard does — the system writes here from a server action, and a
-- guard that only admits `is_portal_admin()` refuses the service role too.
-- ---------------------------------------------------------------------------

create or replace function public.guard_monthly_recap_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.member_id is distinct from old.member_id
     or new.recap_month is distinct from old.recap_month
     or new.body is distinct from old.body
     or new.sent_at is distinct from old.sent_at
     or new.id is distinct from old.id then
    raise exception 'Only marking it read is yours to change on a recap';
  end if;

  return new;
end;
$$;

comment on function public.guard_monthly_recap_member_update() is
  'A member may set opened_at on their own sent recap, and nothing else — the text and the send are Nina''s. Column-level restriction, which a policy cannot express.';

create trigger monthly_recaps_guard_member_update
  before update on public.monthly_recaps
  for each row
  execute function public.guard_monthly_recap_member_update();
