-- =============================================================================
-- An editor can take a stage back out. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Found building Stage 4's setup screens, 8 October: **no launch table has
-- a delete policy for anybody but an admin.** So Elize could add a stage
-- and never remove it, add a price option and never remove it, and type a
-- figure and never clear it — each one failing by matching no row, which
-- under RLS is not an error at all.
--
-- The actions already notice, because they read back what went rather than
-- trusting the call, and say "it needs an admin". That is honest and it is
-- not the behaviour anybody wants: §6.1 has stages "added in order", and
-- adding implies taking back out.
--
-- The fourth time this exact gap has appeared — report_top_items,
-- report_values, report_targets, and now these three. The pattern is
-- always the same: a screen clears something, the delete matches nothing,
-- and the only reason it was ever noticed is a read-back.
--
-- **Safe to add only because the guard already exists.** Shipped this
-- morning: `guard_report_published_launch` refuses every write to a
-- published retainer launch, delete included, precisely so that adding a
-- delete policy later could not reopen it. This is that later.
--
-- An emptied figure must be REMOVED rather than stored as zero. §4's dash
-- depends on the difference between a figure nobody entered and a figure
-- entered as nothing, and a zero would draw a bar where there should be a
-- gap.
--
-- =============================================================================
-- THE SWEEP Dom asked for, 8 October
-- =============================================================================
--
-- Every `report_*` table that an editor may insert into or update but not
-- delete from, and whether that is a gap or a decision. Read off live, not
-- from memory.
--
-- GENUINE GAPS, SHIPPED HERE
--   · report_launch_stages — §6.1 has stages "added in order", and adding
--     implies taking back out. Bounded by the published-launch guard.
--   · report_launch_prices — a price option that was never offered has to
--     come out. Same bound.
--   · report_launch_values — needed twice over: an emptied box must remove
--     the figure rather than store a zero, AND the restrict below means
--     "clear them first" has to be something an editor can actually do.
--   · report_benchmarks — a benchmark that turned out not to apply can
--     only be removed, because there is no empty value for one: the column
--     is NOT NULL and the form upserts. Unbounded, like its insert and
--     update, because a benchmark belongs to no month.
--
-- DELIBERATELY ABSENT, AND WHY
--   · report_values — an emptied box stores empty rather than deleting the
--     row; `ValueBag` reads either as a dash, so there is nothing a delete
--     would add.
--   · report_notes — same for an objective ("stored empty, not deleted",
--     and rule 7 is the reason); and §8 is explicit that a client's reply,
--     once sent, stays.
--   · report_entities — "retire" is the route, and yesterday's
--     `on delete restrict` exists precisely to stop a deletion taking a
--     client's history with it.
--   · report_csv_imports — append-only on purpose. The record of an import
--     is evidence of where a figure came from; an editor who could delete
--     it could erase that.
--   · report_periods — a period row is how a month exists at all.
--   · report_workspaces — rule 7.
--   · report_launches — deleting one destroys a client's whole launch
--     report, and cascades to every stage, price and figure on it. There
--     is no screen that asks for it. **And the guard was update-only**, so
--     a delete policy added later would have been unguarded — fixed below,
--     so the hole cannot be opened quietly.

create policy report_launch_stages_delete_editors
  on public.report_launch_stages for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

create policy report_launch_prices_delete_editors
  on public.report_launch_prices for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

create policy report_launch_values_delete_editors
  on public.report_launch_values for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

comment on policy report_launch_stages_delete_editors on public.report_launch_stages is
  'A stage added by mistake comes back out. Bounded by guard_report_published_launch, which refuses it once the launch has gone out.';

comment on policy report_launch_prices_delete_editors on public.report_launch_prices is
  'A price option that was never offered comes back out. Same bound.';

comment on policy report_launch_values_delete_editors on public.report_launch_values is
  'An emptied box removes the figure rather than storing a zero — §4''s dash depends on the difference. Same bound.';

-- -----------------------------------------------------------------------------
-- A benchmark can be taken off again
-- -----------------------------------------------------------------------------
-- The one gap outside launches. `benchmark_value` is NOT NULL and the form
-- upserts, so there is no way to say "this figure has no benchmark" except
-- by removing the row — and only an admin could.
create policy report_benchmarks_delete_editors
  on public.report_benchmarks for delete
  to authenticated
  using (public.report_can_edit(workspace_id));

comment on policy report_benchmarks_delete_editors on public.report_benchmarks is
  'A benchmark that turned out not to apply comes off. There is no empty value for one, so removing the row is the only way to say it (Dom, 8 Oct 2026).';

-- -----------------------------------------------------------------------------
-- A stage's figures are not swept away with the stage
-- -----------------------------------------------------------------------------
-- `report_launch_values.stage_id` and `.price_id` were both
-- `on delete cascade`, so removing a stage took its sign-ups, its
-- attendance and its whole email sequence with it — silently, because a
-- foreign key cascade does not consult RLS or fire a policy.
--
-- **That is reachable on a launch the client has already read**, which is
-- what makes it worth changing rather than tolerating: a correction goes
-- unpublish → fix → republish, so a "draft" launch is routinely one that
-- has been out. Yesterday's reasoning about offers applies unchanged.
--
-- `restrict` rather than `set null`: an orphaned figure is a number
-- belonging to no stage, which no screen can draw and nobody can match up
-- again. Refusing keeps the question with the person who wanted the stage
-- gone — and `deleteStageMessage` in `src/lib/reporting/launch-delete.ts`
-- is the sentence that asks it.
alter table public.report_launch_values
  drop constraint report_launch_values_stage_id_fkey,
  add constraint report_launch_values_stage_id_fkey
    foreign key (stage_id) references public.report_launch_stages (id)
    on delete restrict;

alter table public.report_launch_values
  drop constraint report_launch_values_price_id_fkey,
  add constraint report_launch_values_price_id_fkey
    foreign key (price_id) references public.report_launch_prices (id)
    on delete restrict;

comment on constraint report_launch_values_stage_id_fkey on public.report_launch_values is
  'Restrict, not cascade: removing a stage would take its figures off a report the client may have read. Clear them first (Dom, 8 Oct 2026).';

comment on constraint report_launch_values_price_id_fkey on public.report_launch_values is
  'Restrict, not cascade. Same reason: a price option''s sales are the report''s, not the row''s.';

-- -----------------------------------------------------------------------------
-- And the launch guard covers delete, so this cannot be reopened quietly
-- -----------------------------------------------------------------------------
-- `report_launches_guard_published` was `before update` only. No editor can
-- delete a launch today, so nothing was wrong — but the next person to add
-- a delete policy would have found the guard silent, which is exactly how
-- the top-items one nearly shipped alone. Said now, while it is free.
-- The function has to learn about DELETE first. It returns `new`
-- throughout, and **a BEFORE DELETE trigger that returns null cancels the
-- delete** — so widening the trigger without this would have made every
-- launch undeletable by anybody, including an admin, and the only symptom
-- would have been a row that quietly stayed.
create or replace function public.guard_report_launch_edits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- A draft is hers to change, and a self-serve launch has no "published"
  -- to speak of.
  if old.published_at is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (
    select 1 from public.report_workspaces w
     where w.id = old.workspace_id and w.kind = 'retainer'
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Deleting a published launch takes the client's whole report with it,
  -- stages, prices and figures included. Nothing about that is a change
  -- to one column.
  if tg_op = 'DELETE' then
    raise exception 'That launch report is published. Unpublish it to make changes.'
      using errcode = 'check_violation';
  end if;

  -- **`status` is deliberately absent from this list.** It describes the
  -- launch rather than the report — a cart really did shut — and a client
  -- looking at "Live now" three weeks after the launch ended is worse
  -- served than one whose badge changed without an email. Nina's
  -- decision 15.
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

drop trigger report_launches_guard_published on public.report_launches;

create trigger report_launches_guard_published
  before update or delete on public.report_launches
  for each row
  execute function public.guard_report_launch_edits();
