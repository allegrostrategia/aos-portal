-- aOS Reporting — Launches brought in line with Nina's launch tracker (§6).
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- **Reviewed by Dom on 19 November and changed once**: the email figures
-- were keyed by (stage, number), so renumbering an email or removing one
-- from the middle of a sequence stranded its figures or moved them onto
-- the email below. They point at the email's row by id now (§5), the
-- existing ones were carried over, `email_number` is retired empty, and
-- the guard checks the email belongs to this launch and to the stage the
-- figure names.
--
-- Nina's final spec, 19 November 2026, after the gap list of the 18th. Her
-- framing matters for how this is built: **"one more reporting view, not a
-- large project."** So this is ONE migration for the whole of it, and it
-- adds as little as the spec can be built on — four columns, one enum, two
-- tables, two context columns and eleven metrics. Everything else is code.
--
-- WHAT IS NOT HERE, AND WHY
--
--   · **No launch-type column.** Her ticks are challenge, masterclass,
--     webinar, workshop, waitlist, open cart and other — which is
--     `report_launch_stage_type`, value for value, already. A launch is
--     its stages, so a second list at launch level would be the same
--     list twice and could disagree with itself. "They set stage names
--     and labels" is `stage-labels.ts` reading the type it already has.
--
--   · **No free-month or free-trial anything** (her item 1, explicitly).
--     The earlier draft had a trial step in the goals and the planner;
--     she took it out, so neither the goals table nor the planner has
--     one and no metric mentions it.
--
--   · **No year view** (her item 10). A launch has no month, and nothing
--     here gives it one.
--
--   · **No names, emails or handles** (her item 10, and the header of
--     `20260930127000_report_launches.sql`, which said it first). The
--     lead list stays in the client's own Drive sheet; aOS stores a LINK
--     to it and counts. `lead_tracker_url` is the only new text column
--     and it holds a URL, not a person.

-- ===========================================================================
-- 1. The launch row: sign-up goals, and the link to their own lead sheet
-- ===========================================================================
-- Her item 4 asks for Good/Better/Best on sign-ups AS WELL AS sales. The
-- sales three already exist as `goal_good/better/best` and keep those
-- names — renaming them would touch every screen, the lock guard and the
-- published snapshot to gain nothing.
alter table public.report_launches
  add column if not exists sign_up_goal_good integer,
  add column if not exists sign_up_goal_better integer,
  add column if not exists sign_up_goal_best integer,
  add column if not exists lead_tracker_url text;

comment on column public.report_launches.sign_up_goal_good is
  'Good/Better/Best on SIGN-UPS (Nina, 19 Nov 2026). The three without a prefix are the sales goals, which came first and kept their names.';
comment on column public.report_launches.lead_tracker_url is
  'A link to the client''s own lead tracker — their Google Drive sheet, shown as a button on the launch page. aOS stores the link and the counts; the names stay in their Drive (Nina, 19 Nov 2026).';

-- The same rule the sales goals have had since 30 September: better is at
-- least good, best is at least better. Written as its own constraint
-- rather than extending `report_launches_goals_ascend`, so a refusal names
-- which three were out of order.
alter table public.report_launches
  drop constraint if exists report_launches_sign_up_goals_ascend;
alter table public.report_launches
  add constraint report_launches_sign_up_goals_ascend
  check (
    (sign_up_goal_good is null or sign_up_goal_better is null
       or sign_up_goal_better >= sign_up_goal_good)
    and (sign_up_goal_better is null or sign_up_goal_best is null
       or sign_up_goal_best >= sign_up_goal_better)
  );

-- A link, and only ever a link. Not validation for its own sake: this
-- column is rendered as an anchor on a page a client opens, so a
-- `javascript:` or `data:` value here would be a script in their browser
-- shipped by whoever typed it. The check is the fix, in the one place
-- every writer goes through.
alter table public.report_launches
  drop constraint if exists report_launches_lead_tracker_is_a_link;
alter table public.report_launches
  add constraint report_launches_lead_tracker_is_a_link
  check (lead_tracker_url is null or lead_tracker_url ~* '^https?://[^\s]+$');

-- ===========================================================================
-- 2. Price options: pay in full, or monthly × a number of months
-- ===========================================================================
-- Her item 3: "Each is either pay in full (one price) or monthly (amount ×
-- number of months)." Which is almost what is already stored — `price` is
-- the contract value, `instalments` and `instalment_amount` describe how
-- it is paid — with one thing missing that no existing column can carry:
-- **whether the money recurs.** An instalment plan and a monthly
-- membership have the same three numbers and different MRR, and MRR is
-- what her item 3 asks for.
create type public.report_launch_price_plan as enum ('full', 'monthly');

alter table public.report_launch_prices
  add column if not exists plan public.report_launch_price_plan not null default 'full';

comment on column public.report_launch_prices.plan is
  'Pay in full, or monthly (Nina, 19 Nov 2026). `price` stays the full contract value either way — for a monthly option it is instalment_amount × instalments — so total revenue needs no special case and MRR counts the monthly rows only.';

-- A monthly option is not a monthly option without both halves of it.
alter table public.report_launch_prices
  drop constraint if exists report_launch_prices_monthly_has_both;
alter table public.report_launch_prices
  add constraint report_launch_prices_monthly_has_both
  check (plan <> 'monthly' or (instalments is not null and instalment_amount is not null));

-- **Relaxed from `> 1` to `> 0`**: a one-month option is a real thing
-- under the new column (a single monthly payment), and the old constraint
-- was written when this pair could only mean a payment plan.
alter table public.report_launch_prices
  drop constraint if exists report_launch_prices_instalments_positive;
alter table public.report_launch_prices
  add constraint report_launch_prices_instalments_positive
  check (instalments is null or instalments > 0);

-- ===========================================================================
-- 3. Sources: the client's own list, with a target each
-- ===========================================================================
-- Her item 6. The six that exist today — stage, email, DM, ads, referral,
-- unknown — are six METRICS, which means the list is ours and not theirs,
-- it cannot carry a target, and it counts sales only. A row per source
-- fixes all three at once, and it is the shape every other "the client
-- adds as many as they need" list in this product already has
-- (`report_entities`, `report_sales_rows`, `report_expense_categories`).
create table public.report_launch_sources (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.report_launches (id) on delete cascade,

  name text not null,
  position smallint not null,

  -- "a target each" — her words, singular. It is a sign-up target: that
  -- is the step a source is steered at, and sales per source are read
  -- against the sign-ups they came from rather than against a second
  -- target nobody set.
  sign_up_target integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (launch_id, name),
  unique (launch_id, position),
  constraint report_launch_sources_name_not_blank check (btrim(name) <> ''),
  constraint report_launch_sources_target_positive
    check (sign_up_target is null or sign_up_target >= 0)
);

comment on table public.report_launch_sources is
  'Where a launch''s sign-ups and sales came from, named by the client (Nina, 19 Nov 2026). A name and a target only — never a person.';

create index report_launch_sources_launch_idx
  on public.report_launch_sources (launch_id, position);

create trigger report_launch_sources_set_updated_at
  before update on public.report_launch_sources
  for each row
  execute function public.set_updated_at();

-- ===========================================================================
-- 4. Emails: a row per email, linked to a stage
-- ===========================================================================
-- Her item 9. The four figures already exist per stage per email; what has
-- no home is everything that is not a number — the date it went, the
-- subject line, and whether it was a resend. A resend is "its own row",
-- which is why the key is (stage, number) and a resend takes the next
-- number rather than a flag on the email it repeats.
create table public.report_launch_emails (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.report_launches (id) on delete cascade,
  stage_id uuid not null references public.report_launch_stages (id) on delete cascade,

  -- **The client's label for the email, not the key its figures hang
  -- off.** The first cut of this had the figures keyed by (stage,
  -- number) and no foreign key at all, on the reasoning that the
  -- figures were stored that way before this table existed. Dom caught
  -- what that costs on review: renumber email 3 to 4, or remove email
  -- 2 from the middle of a sequence, and its open rate either strands
  -- itself against a number nothing describes or lands on the email
  -- below it. So the figures point at `id` (§5) and this number is free
  -- to be edited, which is what a number a person typed has to be.
  number smallint not null,

  sent_on date,
  subject text,
  is_resend boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (stage_id, number),
  constraint report_launch_emails_number_positive check (number > 0)
);

comment on table public.report_launch_emails is
  'One row per launch email: which stage, which number, when it went, its subject line, and whether it was a resend (Nina, 19 Nov 2026). The open and click rates stay in report_launch_values, pointing at this row by id, so renumbering an email takes its figures with it.';

create index report_launch_emails_launch_idx
  on public.report_launch_emails (launch_id, stage_id, number);

create trigger report_launch_emails_set_updated_at
  before update on public.report_launch_emails
  for each row
  execute function public.set_updated_at();

-- ===========================================================================
-- 5. A figure can now hang off a source, and points at its email by id
-- ===========================================================================
alter table public.report_launch_values
  add column if not exists source_id uuid
    references public.report_launch_sources (id) on delete restrict;

comment on column public.report_launch_values.source_id is
  'The fifth context a launch figure can hang off: sign-ups and sales per source (Nina, 19 Nov 2026).';

alter table public.report_launch_values
  add column if not exists email_id uuid
    references public.report_launch_emails (id) on delete cascade;

comment on column public.report_launch_values.email_id is
  'Which email this figure belongs to (Dom, 19 Nov 2026). Replaces email_number: the number is the client''s label and they edit it, so a figure keyed by the number was stranded or moved by a renumber.';

-- **CASCADE here, where the stage, the price and the source all
-- restrict** — and the difference is what the row IS, not a change of
-- heart about cascades.
--
-- A stage, a price option and a source are things a figure is *filed
-- under*: the sign-ups happened whichever source you later rename or
-- remove, so dropping the label must never quietly drop the number, and
-- those three say so out loud instead (`launch-delete.ts`).
--
-- An email row is the email. Its open rate is not a figure filed under
-- it, it is a property of it: there is no open rate of an email that was
-- never sent. Removing the row is how an editor removes the email, and
-- leaving five figures behind pointing at nothing would be the strand
-- this column exists to prevent. The lock still holds on a published
-- launch — §6 puts `guard_report_published_launch` on the email table
-- itself, so the delete that would cascade is refused before it starts.
comment on constraint report_launch_values_email_id_fkey on public.report_launch_values is
  'Cascade, unlike stage_id, price_id and source_id: an email''s figures are properties of the email rather than figures filed under it, so removing the row is how they go (19 Nov 2026).';

-- **RESTRICT, the same as the stage and price keys**, and for the reason
-- written over `launch_deletes`: a cascade does not consult RLS and fires
-- no policy, so removing a source would quietly take its sign-ups and its
-- sales off a report somebody has read. The editor is asked to clear the
-- two figures first, which is one extra step on a rare action and the
-- difference between losing a figure and being told about it.
comment on constraint report_launch_values_source_id_fkey on public.report_launch_values is
  'Restrict, like stage_id and price_id: removing a source with figures on it is refused and said out loud, never cascaded (19 Nov 2026).';

-- One figure per cell, with the new contexts in the key. Dropped and
-- recreated rather than added to: a unique index cannot be extended.
--
-- **Dropped BEFORE the carry-over below, not after**, and that order is
-- load-bearing. The carry-over empties `email_number` as it fills
-- `email_id`, so for a moment emails 1 and 2 of a stage are both
-- `coalesce(email_number, 0) = 0` — under the old index, with
-- `email_number` in it and `email_id` not, that is a duplicate key and
-- the whole migration rolls back on the first stage that sent two
-- emails.
drop index if exists report_launch_values_one_per_cell;

-- Carrying the email figures onto their rows.
--
-- Every figure that was keyed by (stage, number) gets the id of that
-- email's row, and a row is created where the figure had no row: a stage
-- could have an open rate for an email nobody had described, because the
-- figures were keyed by a number rather than by a row that had to exist.
-- Those rows are the email, with nothing said about it yet.
--
-- Safe to run twice — a figure only moves where `email_id` is still
-- null — and it ends by refusing to leave one behind.
do $$
declare
  v_row record;
  v_email uuid;
  v_stranded integer;
begin
  -- An email figure with no stage cannot be carried: the email table is
  -- keyed by (stage, number) and there is no stage to put it under. So
  -- the migration says how many and stops, rather than dropping a figure
  -- or inventing a stage for it.
  --
  -- **It stopped, the first time it was pointed at live**, on 24 open
  -- rates — every email figure the demo had. They were the launch-level
  -- keying of finding 1: no stage, so no screen could read them, and the
  -- demo reseed in the same hour rewrites every one of them properly.
  -- They were cleared before this was applied. If this ever raises on a
  -- real client's figures, the answer is not to clear them: find the
  -- stage they belong to, set it, and run this again.
  select count(*) into v_stranded
    from public.report_launch_values
   where email_number is not null and stage_id is null;
  if v_stranded > 0 then
    raise exception '% launch email figures have no stage and cannot be carried over', v_stranded;
  end if;

  for v_row in
    select v.id, v.launch_id, v.stage_id, v.email_number
      from public.report_launch_values v
     where v.email_number is not null
       and v.email_id is null
     order by v.launch_id, v.stage_id, v.email_number
  loop
    select id into v_email
      from public.report_launch_emails
     where stage_id = v_row.stage_id and number = v_row.email_number;

    if v_email is null then
      insert into public.report_launch_emails (launch_id, stage_id, number)
      values (v_row.launch_id, v_row.stage_id, v_row.email_number)
      returning id into v_email;
    end if;

    update public.report_launch_values
       set email_id = v_email, email_number = null
     where id = v_row.id;
  end loop;

  select count(*) into v_stranded
    from public.report_launch_values where email_number is not null;
  if v_stranded > 0 then
    raise exception '% launch email figures were left keyed by number', v_stranded;
  end if;
end;
$$;

-- **The column stays, empty.** Dropping it is the one step in this file
-- that could not be undone on live, and it buys nothing: the number it
-- held is on `report_launch_emails.number` now, nothing reads it, and the
-- check below means nothing can write it again. Two keys for one context,
-- either of which could be the real one, is the bug this review fixed —
-- a column that refuses every value is not that.
alter table public.report_launch_values
  drop constraint if exists report_launch_values_email_number_retired;
alter table public.report_launch_values
  add constraint report_launch_values_email_number_retired
  check (email_number is null);

comment on column public.report_launch_values.email_number is
  'Retired 19 Nov 2026 and held empty by report_launch_values_email_number_retired. Its figures were carried onto email_id; the number itself lives on report_launch_emails.number.';

create unique index report_launch_values_one_per_cell
  on public.report_launch_values (
    launch_id,
    metric_key,
    coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(price_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(email_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(day_number, 0)
  );

-- And the guard learns the fifth context. Restated whole rather than
-- patched, so the complete list of what a launch figure may hang off is
-- readable in one place.
create or replace function public.guard_report_launch_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_type public.report_input_type;
  v_category public.report_category;
begin
  select input_type, category into v_input_type, v_category
  from public.report_metrics where key = new.metric_key;

  if v_category <> 'launches' then
    raise exception 'Metric % is not a launch metric', new.metric_key;
  end if;

  if v_input_type in ('calc', 'pulled') then
    raise exception 'Metric % is %, so it is worked out rather than stored (brief §9)',
      new.metric_key, v_input_type;
  end if;

  if new.stage_id is not null and not exists (
    select 1 from public.report_launch_stages
    where id = new.stage_id and launch_id = new.launch_id
  ) then
    raise exception 'That stage belongs to a different launch';
  end if;

  if new.price_id is not null and not exists (
    select 1 from public.report_launch_prices
    where id = new.price_id and launch_id = new.launch_id
  ) then
    raise exception 'That price option belongs to a different launch';
  end if;

  if new.source_id is not null and not exists (
    select 1 from public.report_launch_sources
    where id = new.source_id and launch_id = new.launch_id
  ) then
    raise exception 'That source belongs to a different launch';
  end if;

  -- The email, both ways round. Belonging to this launch is the same
  -- check the other three get; belonging to this STAGE is the one this
  -- column needs on top, because an email figure carries a stage as well
  -- as an email and the page reads it under the stage. Let the two
  -- disagree and the open rate of challenge email 2 is drawn in the
  -- webinar's table.
  if new.email_id is not null then
    if not exists (
      select 1 from public.report_launch_emails
      where id = new.email_id and launch_id = new.launch_id
    ) then
      raise exception 'That email belongs to a different launch';
    end if;

    if new.stage_id is not null and not exists (
      select 1 from public.report_launch_emails
      where id = new.email_id and stage_id = new.stage_id
    ) then
      raise exception 'That email belongs to a different stage of this launch';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_report_launch_value() is
  'Integrity for a launch figure: a launch metric, never a calc, a stage, price or source that belongs to this launch, and an email that belongs to this launch and to the stage the figure names (19 Nov 2026).';

-- ===========================================================================
-- 6. Access, for both new tables
-- ===========================================================================
-- Copied from `report_launch_prices` deliberately, policy for policy: both
-- new tables are lists a client adds to and removes from, reached through
-- their launch, which is exactly what the price options are. A different
-- shape here would be a second set of rules to keep in step.
alter table public.report_launch_sources enable row level security;
alter table public.report_launch_emails enable row level security;

create policy report_launch_sources_all_admin
  on public.report_launch_sources for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_launch_sources_select_readers
  on public.report_launch_sources for select to authenticated
  using (public.report_can_read_launch(launch_id));
create policy report_launch_sources_write_editors
  on public.report_launch_sources for insert to authenticated
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_sources_update_editors
  on public.report_launch_sources for update to authenticated
  using (public.report_can_edit_launch(launch_id))
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_sources_delete_editors
  on public.report_launch_sources for delete to authenticated
  using (public.report_can_edit_launch(launch_id));

create policy report_launch_emails_all_admin
  on public.report_launch_emails for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_launch_emails_select_readers
  on public.report_launch_emails for select to authenticated
  using (public.report_can_read_launch(launch_id));
create policy report_launch_emails_write_editors
  on public.report_launch_emails for insert to authenticated
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_emails_update_editors
  on public.report_launch_emails for update to authenticated
  using (public.report_can_edit_launch(launch_id))
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_emails_delete_editors
  on public.report_launch_emails for delete to authenticated
  using (public.report_can_edit_launch(launch_id));

comment on policy report_launch_sources_delete_editors on public.report_launch_sources is
  'Removing a source is how a client corrects a typo in one, so whoever may edit the launch may delete one — the same rule the price options have.';

-- A published retainer launch holds still, and that has to include the two
-- new tables. The guard already exists and already covers the case; what
-- is new is that it is now on five tables rather than three. Missing one
-- would be a published launch whose source list or email table still
-- moved, which is the exact hole `20261008100001` was written to close.
create trigger report_launch_sources_guard_published
  before insert or update or delete on public.report_launch_sources
  for each row
  execute function public.guard_report_published_launch();

create trigger report_launch_emails_guard_published
  before insert or update or delete on public.report_launch_emails
  for each row
  execute function public.guard_report_published_launch();

comment on function public.guard_report_published_launch() is
  'Refuses writes to the stages, prices, sources, emails and figures of a published retainer launch. Admin and the service role pass (19 Nov 2026).';

-- And the three new goal columns join the list of what may not move on a
-- published launch. `lead_tracker_url` deliberately does NOT: it is a link
-- to somewhere else, not a figure on the report, and a client whose sheet
-- has moved should be able to fix the button without unpublishing a
-- report whose numbers are not changing. Flagged for Nina.
create or replace function public.guard_report_launch_edits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- **Restated from `20261008120000`, not from the version that created
  -- it**, and that distinction is the whole of this block. The trigger
  -- is `before update OR DELETE`, and a BEFORE DELETE trigger that
  -- returns null CANCELS THE DELETE SILENTLY — no error, no row
  -- removed. Restating the earlier `return new` body over the top of it
  -- made every launch undeletable by anybody, including the service
  -- role, with the only symptom a row that quietly stayed: 1,141 of
  -- them, orphaned from workspaces whose cascade had been swallowed,
  -- before the browser suite caught it.
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
  --
  -- The three sign-up goals join it today (19 November): a goal is a
  -- figure on the report and holds still with the rest of them.
  -- `lead_tracker_url` deliberately does not — it is a link to somewhere
  -- else, not a figure, and a client whose sheet has moved should be able
  -- to fix the button without unpublishing a report whose numbers are not
  -- changing. Flagged for Nina.
  if new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.offer_entity_id is distinct from old.offer_entity_id
     or new.cover_image_path is distinct from old.cover_image_path
     or new.goal_good is distinct from old.goal_good
     or new.goal_better is distinct from old.goal_better
     or new.goal_best is distinct from old.goal_best
     or new.sign_up_goal_good is distinct from old.sign_up_goal_good
     or new.sign_up_goal_better is distinct from old.sign_up_goal_better
     or new.sign_up_goal_best is distinct from old.sign_up_goal_best
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
  'Which columns of a published launch may still move. Status and the lead-tracker link may; the goals, the labels and the planner rates may not (19 Nov 2026).';

-- ===========================================================================
-- 7. The eleven new figures
-- ===========================================================================
-- sort_order 47 onwards: launches ended at 46, and the unique
-- (category, sort_order) is checked row by row, so appending never
-- renumbers anything. `report_metrics_seed.sql` is a GENERATED file read
-- from the brief — these go in their own migration for the same reason
-- §5.2's eighteen did on 18 November.
insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('launches_sign_ups_from_source', 'launches', 'Sign-ups from source', 'core', 'count', 'up', null, null, 47),
  ('launches_sales_from_source', 'launches', 'Sales from source', 'core', 'count', 'up', null, null, 48),
  ('launches_email_clicked_no_sign_up', 'launches', 'Clicked but didn''t sign up', 'core', 'count', 'down', null, null, 49),
  ('launches_ad_budget', 'launches', 'Ad budget', 'optional', 'currency', 'none', null, null, 50),
  ('launches_target_cost_per_sign_up', 'launches', 'Target cost per sign-up', 'optional', 'currency', 'down', null, null, 51),
  ('launches_ad_clicks', 'launches', 'Ad link clicks', 'optional', 'count', 'up', null, null, 52),
  ('launches_ad_budget_left', 'launches', 'Budget left', 'calc', 'currency', 'none', null, 'Ad budget − ad spend', 53),
  ('launches_cost_per_click', 'launches', 'Cost per click', 'calc', 'currency', 'down', null, 'Ad spend ÷ ad link clicks', 54),
  ('launches_mrr_from_launch', 'launches', 'MRR from this launch', 'calc', 'currency', 'up', null, 'Sum of (sales × monthly amount) on the monthly price options', 55),
  ('launches_ad_sign_ups_needed', 'launches', 'Ad sign-ups needed', 'calc', 'count', 'none', null, 'Ad budget ÷ target cost per sign-up, rounded up', 56),
  ('launches_percent_of_source_target', 'launches', 'Percent of source target', 'calc', 'percent', 'up', null, 'Sign-ups from a source ÷ that source''s target', 57)
on conflict (key) do nothing;

-- The six that are superseded stay exactly where they are. Nothing is ever
-- deleted, their figures are carried over below rather than dropped, and a
-- launch somebody typed before today keeps reading correctly.
comment on column public.report_launch_values.metric_key is
  'From 19 Nov 2026 sales by source is `launches_sales_from_source` against a row in report_launch_sources. The six `launches_sales_from_<channel>` metrics are superseded and kept: their figures were carried over, not dropped.';

-- ===========================================================================
-- 8. Carrying the existing sales-by-source figures over
-- ===========================================================================
-- Her item 6: "Carry any existing sales-by-source figures over as that
-- launch's sources." Their own labels, not invented ones — the point of
-- carrying them is that nobody has to retype what they already said.
--
-- Written to be safe to run twice: a source is only created where one of
-- that name does not already exist, and a figure only moves where the new
-- cell is empty. Both halves matter, because this file will be applied to
-- a live database that already holds the demo's two launches.
do $$
declare
  v_row record;
  v_source uuid;
  v_next smallint;
begin
  for v_row in
    select v.id, v.launch_id, v.value, v.metric_key,
           case v.metric_key
             when 'launches_sales_from_stage' then 'Free event'
             when 'launches_sales_from_email' then 'Email'
             when 'launches_sales_from_dm' then 'DMs'
             when 'launches_sales_from_ads' then 'Ads'
             when 'launches_sales_from_referral' then 'Referral'
             when 'launches_sales_from_unknown' then 'Not sure'
           end as source_name
      from public.report_launch_values v
     where v.metric_key in (
             'launches_sales_from_stage', 'launches_sales_from_email',
             'launches_sales_from_dm', 'launches_sales_from_ads',
             'launches_sales_from_referral', 'launches_sales_from_unknown')
       and v.value is not null
     order by v.launch_id, v.metric_key
  loop
    select id into v_source
      from public.report_launch_sources
     where launch_id = v_row.launch_id and name = v_row.source_name;

    if v_source is null then
      select coalesce(max(position), 0) + 1 into v_next
        from public.report_launch_sources where launch_id = v_row.launch_id;
      insert into public.report_launch_sources (launch_id, name, position)
      values (v_row.launch_id, v_row.source_name, v_next)
      returning id into v_source;
    end if;

    insert into public.report_launch_values
      (launch_id, metric_key, source_id, value)
    values
      (v_row.launch_id, 'launches_sales_from_source', v_source, v_row.value)
    on conflict do nothing;
  end loop;
end;
$$;

-- "Free event" rather than "Stage", for the one label that could not be
-- carried as it stood: `launches_sales_from_stage` meant "from the
-- challenge or masterclass itself", and "Stage" on a client's own source
-- list beside Email and Ads reads as a piece of our furniture rather than
-- as a place a sign-up came from.
