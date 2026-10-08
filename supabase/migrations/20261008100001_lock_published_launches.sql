-- =============================================================================
-- A published launch stops changing too. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Dom, 8 October: the published-month lock and the carried-figure snapshot
-- are both keyed to months, and launches are not months. Once a launch
-- report is visible to a client its figures must hold still the same way,
-- and be corrected the same way: unpublish, fix, republish.
--
-- HOW A LAUNCH BECOMES VISIBLE TODAY
--   `report_launches.published_at`, set by an admin alone —
--   `guard_report_launch_publish` has refused a team member since
--   30 September. `report_can_read_launch` then admits the client:
--
--       report_can_view(workspace)
--         and ( report_can_edit(workspace)
--               or workspace kind <> 'retainer'
--               or launch.published_at is not null )
--
--   So: same shape as a month, with `published_at` on the launch instead of
--   on a period row, and the same self-serve carve-out — a non-retainer
--   workspace's launches are always visible to their owner, who is also
--   their own editor. Which is why this lock, like the month one, applies
--   to **retainer workspaces only**. An unscoped version would shut a
--   self-serve member out of their own launch behind an unpublish button
--   that is admin-only and that they never see.
--
-- WHAT HAS TO HOLD STILL
--   Everything the client reads: the figures (`report_launch_values`), the
--   stages (`report_launch_stages`) and the price options
--   (`report_launch_prices`) — not only the figures, because the stages and
--   the prices ARE figures in effect. Which stage is the main selling one
--   decides the conversion rate; a price option's price and sales decide
--   total revenue, average order value and every percentage of goal. And
--   the launch row's own fields, which are its goals and its labels.
--
--   As with months, all three verbs on each table. There is no delete
--   policy on any launch table today, so only an admin can delete — but
--   the guard covers delete anyway, so that adding one later cannot
--   reopen this without somebody touching the guard. That is exactly how
--   the top-items delete policy nearly shipped alone on 6 October.
--
-- WHAT DOES NOT HAVE TO
--   **`status` is exempt**, and it is the one judgement call here. See the
--   note on it below; it is on Nina's list as decision 15.
--
--   There is no client reply on a launch page — §8's conversation is on the
--   monthly report — so unlike `report_notes` there is nothing to carve out.
--
-- WHAT A LAUNCH CARRIES FROM OUTSIDE ITSELF
--   Almost nothing, which is the good news. A launch's revenue comes from
--   **its own price options**, not from the linked offer's price — checked
--   in `formulas.ts`, where `launch.totalRevenue` sums (sales × price) over
--   `report_launch_prices`. Its goals, its planner rates, its stages and
--   its figures are all its own.
--
--   The single thing that crosses the boundary is the **linked offer's
--   name**, which is a label on the page. Rename "Signature programme" and
--   a published launch report silently says something else. So the snapshot
--   is one small object rather than the month's whole bag.

-- -----------------------------------------------------------------------------
-- What this launch was published with
-- -----------------------------------------------------------------------------
alter table public.report_launches
  add column carried jsonb not null default '{}'::jsonb;

comment on column public.report_launches.carried is
  'What this launch was published with that does not belong to it — today just the linked offer''s name. `{}` means nothing was frozen, and the page works it out live, the same convention as report_periods.carried.';

-- -----------------------------------------------------------------------------
-- Is this launch closed to edits?
-- -----------------------------------------------------------------------------
create or replace function public.report_launch_is_locked(p_launch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.report_launches l
      join public.report_workspaces w on w.id = l.workspace_id
     where l.id = p_launch_id
       and l.published_at is not null
       and w.kind = 'retainer'
  );
$$;

comment on function public.report_launch_is_locked(uuid) is
  'Whether a launch is closed to edits: published, and on a retainer workspace. The launch twin of report_month_is_locked (Dom, 8 Oct 2026).';

-- -----------------------------------------------------------------------------
-- The guard, for everything that hangs off a launch
-- -----------------------------------------------------------------------------
create or replace function public.guard_report_published_launch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_launch uuid;
  v_old_launch uuid;
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_launch := old.launch_id;
  else
    v_launch := new.launch_id;
  end if;

  if public.report_launch_is_locked(v_launch) then
    raise exception 'That launch report is published. Unpublish it to make changes.'
      using errcode = 'check_violation';
  end if;

  -- Moving a row OUT of a published launch empties that report without
  -- ever writing to it. The same trap the month guard covers, where the
  -- key column is as much in play as the value.
  if tg_op = 'UPDATE' then
    v_old_launch := old.launch_id;
    if v_old_launch is distinct from v_launch
       and public.report_launch_is_locked(v_old_launch)
    then
      raise exception 'That launch report is published. Unpublish it to make changes.'
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.guard_report_published_launch() is
  'Refuses writes to the stages, prices and figures of a published retainer launch. Admin and the service role pass.';

create trigger report_launch_values_guard_published
  before insert or update or delete on public.report_launch_values
  for each row
  execute function public.guard_report_published_launch();

create trigger report_launch_stages_guard_published
  before insert or update or delete on public.report_launch_stages
  for each row
  execute function public.guard_report_published_launch();

create trigger report_launch_prices_guard_published
  before insert or update or delete on public.report_launch_prices
  for each row
  execute function public.guard_report_published_launch();

-- -----------------------------------------------------------------------------
-- And the launch row itself
-- -----------------------------------------------------------------------------
-- Its own table, so its own guard: here the question is which COLUMNS may
-- move on a published launch, not whether the row may be touched at all —
-- because unpublishing is itself an update to this row, and a guard that
-- refused every update would lock the door and throw away the key.
create or replace function public.guard_report_launch_edits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  -- A draft is hers to change, and a self-serve launch has no "published"
  -- to speak of.
  if old.published_at is null then
    return new;
  end if;
  if not exists (
    select 1 from public.report_workspaces w
     where w.id = old.workspace_id and w.kind = 'retainer'
  ) then
    return new;
  end if;

  -- **`status` is deliberately absent from this list.** It describes the
  -- launch rather than the report — a cart really did shut — and a client
  -- looking at "Live now" three weeks after the launch ended is worse
  -- served than one whose badge changed without an email. Every figure
  -- below it is a different matter. Flagged for Nina as decision 15; if
  -- she would rather it were held too, it joins the list and the fix is
  -- one line.
  if new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.offer_entity_id is distinct from old.offer_entity_id
     or new.cover_image_path is distinct from old.cover_image_path
     or new.goal_good is distinct from old.goal_good
     or new.goal_better is distinct from old.goal_better
     or new.goal_best is distinct from old.goal_best
     or new.planner_show_up_rate is distinct from old.planner_show_up_rate
     or new.planner_conversion_rate is distinct from old.planner_conversion_rate
  then
    raise exception 'That launch report is published. Unpublish it to make changes.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_launch_edits() is
  'Which columns of a published launch may still move. Status may; the goals, the labels and the planner rates may not (Dom, 8 Oct 2026).';

create trigger report_launches_guard_published
  before update on public.report_launches
  for each row
  execute function public.guard_report_launch_edits();

-- -----------------------------------------------------------------------------
-- `carried` is the system's column, like the month snapshot before it
-- -----------------------------------------------------------------------------
-- Restated whole rather than patched, so the complete list of columns only
-- an admin may write is readable in one place. The `carried` clauses are
-- the only new ones.
create or replace function public.guard_report_launch_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.published_at is not null or new.published_by is not null
       or new.carried <> '{}'::jsonb then
      raise exception 'Only an admin can publish a launch report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.carried is distinct from old.carried
  then
    raise exception 'Only an admin can publish a launch report';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_launch_publish() is
  'Elize drafts a launch, Nina publishes it (30 Sep 2026), and neither a team member nor a client writes its snapshot (8 Oct 2026).';
