-- aOS Reporting Tool — notes and commentary.
--
-- Brief §8: "Written words come from people, never generated." Nothing here
-- or anything reading it calls an AI (CLAUDE.md rule 2).
--
-- This is the table §13 singles out: "draft reports and unpublished notes
-- must be unreadable to the client at database level." Not hidden by a screen
-- that does not render them — unreadable. The select policy below is that
-- promise, and "a retainer client reads zero strategist notes for an
-- unpublished month" is asserted as that client, over RLS, in the schema test.

create table public.report_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,

  -- Null = the Overview-level note ("Notes from your strategist" for a
  -- retainer client, "Your reflections this month" for a member). Set = the
  -- per-category note on that entry page.
  category public.report_category,

  note_type public.report_note_type not null,

  author_id uuid references auth.users (id) on delete set null,

  -- The signature the client actually sees — "Nina Oliver, your strategist"
  -- in the approved mockup. Stored rather than joined because there is
  -- nowhere to join TO: Elize and the retainer clients have no `members` row
  -- by design, and `auth.users` is not readable under RLS. Keeping it on the
  -- note also means it stays the name that signed it, which is the honest
  -- thing for a document the client was sent months ago.
  author_name text not null,

  body text not null,

  -- §8: "Up to 3 objectives." A smallint and the partial unique index below
  -- make "up to 3" a property of the table rather than a rule the form
  -- remembers.
  position smallint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_notes_month_is_first check (extract(day from month) = 1),
  constraint report_notes_position_range
    check (position is null or (position between 1 and 3)),
  constraint report_notes_position_is_for_objectives
    check (position is null or note_type = 'objective')
);

create unique index report_notes_three_objectives
  on public.report_notes (workspace_id, month, position)
  where note_type = 'objective';

create index report_notes_workspace_month_idx
  on public.report_notes (workspace_id, month);

create trigger report_notes_set_updated_at
  before update on public.report_notes
  for each row
  execute function public.set_updated_at();

-- An assigned Allegro staffer, as distinct from a self-serve client who can
-- also edit their own workspace. Only the team writes a strategist note: for
-- an aOS member the equivalent is their own reflection (§8's table), and a
-- member filing a "note from your strategist" about themselves would be an
-- odd thing for the schema to permit.
create or replace function public.report_is_team(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.report_access
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role = 'team'
  );
$$;

alter table public.report_notes enable row level security;

create policy report_notes_all_admin
  on public.report_notes for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- Two ways to read a note, and only two:
--
--   · the month is readable by you — an editor's own draft, or a published
--     month, or any month of a self-serve workspace; or
--   · you wrote it. A retainer client's reply to last month's report stays
--     theirs to read even while this month is still a draft.
--
-- A strategist note on an unpublished retainer month satisfies neither, for
-- the client, which is the requirement.
create policy report_notes_select_readers
  on public.report_notes for select
  to authenticated
  using (
    public.report_can_view(workspace_id)
    and (
      public.report_can_read_month(workspace_id, month)
      or author_id = (select auth.uid())
    )
  );

create policy report_notes_write
  on public.report_notes for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.report_can_read_month(workspace_id, month)
    and case note_type
      -- §2: a retainer client's whole write access is this one row type.
      when 'client_reply' then public.report_can_view(workspace_id)
      when 'strategist' then public.report_is_team(workspace_id)
      else public.report_can_edit(workspace_id)
    end
  );

-- Revising what you wrote. Everyone gets this — Elize correcting a note
-- before publishing, a member rewriting their reflection — because the
-- alternative is a typo that can never be fixed (rule 7 is about not
-- deleting records, not about freezing prose).
create policy report_notes_update_own
  on public.report_notes for update
  to authenticated
  using (author_id = (select auth.uid()) and public.report_can_view(workspace_id))
  with check (author_id = (select auth.uid()));

-- RLS grants the row, so without this an author could edit their own note
-- into a different type, month or workspace. The column-ownership trap, one
-- more time.
create or replace function public.guard_report_note_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.month is distinct from old.month
     or new.category is distinct from old.category
     or new.note_type is distinct from old.note_type
     or new.author_id is distinct from old.author_id
     or new.author_name is distinct from old.author_name
  then
    raise exception 'A note''s text can be revised; what it is and who wrote it cannot';
  end if;

  return new;
end;
$$;

create trigger report_notes_guard_update
  before update on public.report_notes
  for each row
  execute function public.guard_report_note_update();
