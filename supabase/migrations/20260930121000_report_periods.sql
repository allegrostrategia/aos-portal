-- aOS Reporting Tool — periods, and the one definition of "published".
--
-- Brief §8: a retainer client's report has two states, Draft (only the team
-- sees it) and Published (the client sees it, and is emailed). Self-serve
-- reports have no draft state — they are always visible to the member who
-- typed them.
--
-- PUBLISHING IS NINA'S ALONE (her decision, 30 September 2026). Elize drafts.
-- That is not a convention the UI keeps to: there is no policy or trigger path
-- by which a team member can set published_at, so there is nothing to route
-- around.

create table public.report_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,

  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, month),
  constraint report_periods_month_is_first check (extract(day from month) = 1),
  -- Published by somebody, or not published. Half a publish is a state the
  -- report screen would have to guess at.
  constraint report_periods_published_by_who
    check ((published_at is null) = (published_by is null))
);

create index report_periods_workspace_idx on public.report_periods (workspace_id, month desc);

create trigger report_periods_set_updated_at
  before update on public.report_periods
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Is this month's data readable by the client whose data it is?
--
-- Defined ONCE and used by every monthly table's select policy. The version
-- of this feature that copied the expression into each policy got it
-- different in four places — including letting a retainer client read targets
-- for a month that had not been published.
-- ---------------------------------------------------------------------------

create or replace function public.report_is_visible(p_workspace_id uuid, p_month date)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    -- Self-serve: always. They typed it; there is nobody to wait for.
    exists (
      select 1 from public.report_workspaces w
      where w.id = p_workspace_id and w.kind <> 'retainer'
    )
    or exists (
      select 1 from public.report_periods p
      where p.workspace_id = p_workspace_id
        and p.month = p_month
        and p.published_at is not null
    );
$$;

comment on function public.report_is_visible(uuid, date) is
  'Whether a month is readable by the client: always for self-serve, only once published for a retainer (§8).';

-- The shape every monthly client-facing table uses. An editor reads their own
-- draft — the thing the first draft of this schema got wrong, which would have
-- shown Elize an empty box straight after she saved a number into it.
create or replace function public.report_can_read_month(p_workspace_id uuid, p_month date)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.report_can_view(p_workspace_id)
    and (
      public.report_can_edit(p_workspace_id)
      or public.report_is_visible(p_workspace_id, p_month)
    );
$$;

comment on function public.report_can_read_month(uuid, date) is
  'Read access to one month of a workspace: editors see their own drafts, clients see published months (and self-serve always).';

alter table public.report_periods enable row level security;

create policy report_periods_all_admin
  on public.report_periods for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- A team member creates and touches the period row — that is how a draft
-- month comes into being — but never publishes it. The guard below is what
-- makes that true; the policy alone cannot express "every column but these
-- two", which is the column-ownership trap §13 names.
create policy report_periods_write_editors
  on public.report_periods for insert
  to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_periods_update_editors
  on public.report_periods for update
  to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

create policy report_periods_select_readers
  on public.report_periods for select
  to authenticated
  using (public.report_can_read_month(workspace_id, month));

create or replace function public.guard_report_period_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The service role (no JWT, so auth.uid() is null) sends the publication
  -- email and may need to write here. Admitting it is the fix this codebase
  -- has already had to make twice.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  -- On insert there is no old row to compare against: a team member creating
  -- a period that arrives already published would otherwise walk straight
  -- past the update branch.
  if tg_op = 'INSERT' then
    if new.published_at is not null or new.published_by is not null then
      raise exception 'Only an admin can publish a report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
  then
    raise exception 'Only an admin can publish a report';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_period_publish() is
  'Elize drafts, Nina publishes (her decision, 30 Sep 2026). Enforced here because RLS is row-level and cannot hold back one column.';

create trigger report_periods_guard_publish
  before insert or update on public.report_periods
  for each row
  execute function public.guard_report_period_publish();
