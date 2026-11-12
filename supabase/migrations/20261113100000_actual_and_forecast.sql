-- =============================================================================
-- Financials, simplified: two grids of row × month × amount.
-- =============================================================================
--
-- NOT APPLIED TO LIVE. For Dom's review.
--
-- Nina's review of the sales grid, 13 November. The ledger built on
-- 11–12 November modelled a sale as a record with a payment plan hanging
-- off it, which is how an accounting system works and is not how she
-- works. What she does each month is open the bank account and Stripe and
-- type in what landed.
--
-- So:
--
--   · **Actual** is money received. A row name and an amount, per month.
--     Nothing else.
--   · **Forecast** is money expected, on its own grid with the same shape,
--     typed or pasted across however many months it lasts. Nothing is
--     generated: retainers live here because somebody types them here.
--
-- WHAT GOES, AND WHY NOTHING IS LOST
--   `report_sales` and `report_sale_payments` held a sale's month, its
--   total value, how it was billed, each instalment's due month, the month
--   the money arrived, and two cancellation columns. Every one of those
--   existed to work out, from what was promised, what actually came in.
--   When the client types what actually came in, the whole derivation is
--   dead weight — and so are the four guards that held it still and the
--   two helpers that decided who could read it.
--
--   All seven tables are empty on live (checked, 13 November: 0 rows in
--   every one). Reporting has never been switched on. So this drops rather
--   than migrates, and there is no data question to answer.
--
-- WHAT THIS ALSO SETTLES
--   `20261112100000_sale_payment_delete.sql` is withdrawn, and its file is
--   deleted in the same commit — it was never applied to live. It argued
--   that clearing a mistyped instalment is a correction rather than a
--   cancellation, and that distinction only existed because an instalment
--   was a promise. A cell of the Actual grid is a figure somebody typed;
--   clearing it is clearing a figure, the way clearing an expense is. Both
--   new tables get a delete policy and the published-month guard fences
--   it, which is the same answer `report_expenses` already has.

-- -----------------------------------------------------------------------------
-- Out
-- -----------------------------------------------------------------------------
-- The tables take their own triggers, indexes and policies with them.
drop table if exists public.report_sale_payments;
drop table if exists public.report_sales;

drop type if exists public.report_sale_billing;

drop function if exists public.guard_report_sale_months();
drop function if exists public.guard_report_sale_payment_months();
drop function if exists public.guard_report_sale_payment_sale();
drop function if exists public.guard_report_sale_row();
drop function if exists public.report_can_read_payment(uuid, date, date);
-- Both signatures: the 11 November one took the sale as well, and live
-- has only the narrowed one. `if exists` so this is true either way.
drop function if exists public.report_can_read_payment(uuid, uuid, date, date);
drop function if exists public.report_cancellation_is_open(uuid, date);

-- -----------------------------------------------------------------------------
-- Recurring moves onto the row
-- -----------------------------------------------------------------------------
--
-- It was `report_sales.billing`, because a sale was the thing that
-- recurred. With no sale record, it belongs to the row — which is also
-- what Nina asked for: a tick on the row.
--
-- Three values rather than a boolean, because her Recurring Revenue tab
-- has three lines: the monthly ones, the annual ones, and the two
-- together. A boolean could not draw it.
create type public.report_recurrence as enum ('none', 'monthly', 'annual');

alter table public.report_sales_rows
  add column recurrence public.report_recurrence not null default 'none';

comment on column public.report_sales_rows.recurrence is
  'The DEFAULT for new cells of the Actual grid. Each cell keeps its own copy, so a row that was one-off in January and a retainer from April is both of those things in the months it was each (Dom, 13 Nov 2026).';

-- -----------------------------------------------------------------------------
-- The two grids
-- -----------------------------------------------------------------------------
--
-- Identical shape on purpose: one row per sales row per month, holding one
-- figure. Two tables rather than one with a `kind` column because the two
-- answer different questions and will not stay identical — a forecast is a
-- plan the team may want visible before the month it is for, and an actual
-- is a figure that belongs to its month. Keeping them apart means that
-- change is a policy on one table rather than a condition inside a shared
-- one.

create table public.report_actuals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sales_row_id uuid not null references public.report_sales_rows (id) on delete restrict,

  month date not null,
  -- **No non-negative check, deliberately, and this is the one judgement
  -- call in the file.** The figure is what landed, and in a month with a
  -- refund or a chargeback what landed can be less than nothing. A
  -- constraint here would refuse a true figure to catch a typo, and the
  -- screen is a better place to query an odd one. Confirmed by Dom,
  -- 13 November; the grid says so in words rather than leaving a minus
  -- sign to be puzzled over.
  amount numeric not null,

  -- **Per cell, not per row** (Dom, 13 November). MRR on a published month
  -- is the actual money received that month on rows that recur, so if this
  -- lived only on the row, unticking it would rewrite a figure a client had
  -- already read — and locking the row instead would mean a client who
  -- paid one-off in January and went on a retainer in April could not be
  -- recorded without an unpublish. A client doing exactly that is the
  -- common case, not the edge one.
  --
  -- Filled from the row by the trigger below when the screen does not say
  -- otherwise. **Lighter than the expense bucket's capture, on purpose:**
  -- a category's bucket can change underneath an expense that is already
  -- saved, so that one has to overrule what the app sends. The row's
  -- recurrence is only ever read at the moment a cell is written, so
  -- nothing can change behind it, and the published-month guard already
  -- refuses every update to a month a client has read.
  recurrence public.report_recurrence not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_actuals_month_is_first check (extract(day from month) = 1),
  unique (workspace_id, sales_row_id, month)
);

create index report_actuals_month_idx on public.report_actuals (workspace_id, month);
create index report_actuals_row_idx on public.report_actuals (sales_row_id);

create trigger report_actuals_set_updated_at
  before update on public.report_actuals
  for each row execute function public.set_updated_at();

create table public.report_forecasts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sales_row_id uuid not null references public.report_sales_rows (id) on delete restrict,

  month date not null,
  -- Nobody forecasts negative money, so here the constraint catches a typo
  -- without ever refusing a true figure.
  amount numeric not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_forecasts_month_is_first check (extract(day from month) = 1),
  constraint report_forecasts_amount_not_negative check (amount >= 0),
  unique (workspace_id, sales_row_id, month)
);

create index report_forecasts_month_idx on public.report_forecasts (workspace_id, month);
create index report_forecasts_row_idx on public.report_forecasts (sales_row_id);

create trigger report_forecasts_set_updated_at
  before update on public.report_forecasts
  for each row execute function public.set_updated_at();

-- A cell belongs to a row of this client's. A foreign key can only say
-- "some row" — the same gap the funnel's linked offer has, closed the same
-- way, and shared by both grids because the question is the same.
--
create or replace function public.guard_report_sales_row_cell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace
  from public.report_sales_rows where id = new.sales_row_id;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'That figure can only be against this business''s own row';
  end if;

  return new;
end;
$$;

-- The row's recurrence, as the default for a cell that does not say.
--
-- **Its own function rather than a branch in the one above**, which was
-- the first attempt and does not work: plpgsql resolves `new.recurrence`
-- when it compiles the expression, not when the branch is taken, so a
-- `tg_table_name` test still throws "record new has no field recurrence"
-- on every forecast. Caught on the first forecast insert.
--
-- Only the Actual grid has one. A forecast is money expected; what MRR is
-- drawn from is money received.
create or replace function public.guard_report_actual_recurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recurrence is null then
    select recurrence into new.recurrence
    from public.report_sales_rows where id = new.sales_row_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_report_actual_recurrence() is
  'Fills a cell''s recurrence from its row when the screen does not say. The row is a default read at write time, not a value the cell keeps a link to - which is why nothing has to be locked (Dom, 13 Nov 2026).';

create trigger report_actuals_guard_row
  before insert or update on public.report_actuals
  for each row execute function public.guard_report_sales_row_cell();

create trigger report_actuals_fill_recurrence
  before insert or update on public.report_actuals
  for each row execute function public.guard_report_actual_recurrence();

create trigger report_forecasts_guard_row
  before insert or update on public.report_forecasts
  for each row execute function public.guard_report_sales_row_cell();

-- -----------------------------------------------------------------------------
-- The published-month lock
-- -----------------------------------------------------------------------------
--
-- Both tables are one figure in one month, which is the shape the shared
-- guard was written for. No custom guard this time: the two months a
-- payment had — due and received — were the reason the old one existed,
-- and there is only one month now.
create trigger report_actuals_guard_published
  before insert or update or delete on public.report_actuals
  for each row execute function public.guard_report_published_month();

create trigger report_forecasts_guard_published
  before insert or update or delete on public.report_forecasts
  for each row execute function public.guard_report_published_month();

-- The row-setup lock, re-pointed. It read `report_sales`, which is gone.
--
-- **`recurrence` is NOT in it** (Dom, 13 November). It is held per cell
-- instead, so changing the tick changes nothing that is already saved and
-- there is nothing to lock. What stays locked is the row's kind and its
-- offer link, because those move money between an offer's slice and the
-- bespoke one in every month at once, and no per-cell copy makes that
-- mean anything.
--
-- Renaming a row stays allowed. It is a label, and the report prints the
-- current one on purpose.
create or replace function public.guard_report_sales_row_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked boolean;
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.row_type is not distinct from old.row_type
     and new.offer_entity_id is not distinct from old.offer_entity_id then
    return new;
  end if;

  select exists (
    select 1 from public.report_actuals a
     where a.sales_row_id = old.id
       and public.report_month_is_locked(a.workspace_id, a.month)
    union all
    select 1 from public.report_forecasts f
     where f.sales_row_id = old.id
       and public.report_month_is_locked(f.workspace_id, f.month)
  ) into v_locked;

  if v_locked then
    raise exception 'That row has figures in a published month. Unpublish it to change what kind of row it is.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_sales_row_published() is
  'A row''s kind and its offer link are held still once a published month holds figures for it: both move money between an offer''s slice and the bespoke one on a report that has gone out. Renaming is not one of those, and neither is recurrence - that is held per cell (13 Nov 2026).';

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
--
-- `report_values`' rule, which is every piece of month content's rule: a
-- client reads it when the month is published and not before, an editor
-- writes it, and admin passes.
--
-- **Delete is in**, for both. A cell of either grid is a figure somebody
-- typed, and clearing a mistyped one is clearing a figure — what
-- `report_expenses` already allows, and the published-month guard refuses
-- it the moment a client has read the month.
alter table public.report_actuals enable row level security;
alter table public.report_forecasts enable row level security;

create policy report_actuals_all_admin on public.report_actuals
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_actuals_select_readers on public.report_actuals
  for select to authenticated using (public.report_can_read_month(workspace_id, month));
create policy report_actuals_write_editors on public.report_actuals
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_actuals_update_editors on public.report_actuals
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
create policy report_actuals_delete_editors on public.report_actuals
  for delete to authenticated using (public.report_can_edit(workspace_id));

create policy report_forecasts_all_admin on public.report_forecasts
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_forecasts_select_readers on public.report_forecasts
  for select to authenticated using (public.report_can_read_month(workspace_id, month));
create policy report_forecasts_write_editors on public.report_forecasts
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_forecasts_update_editors on public.report_forecasts
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
create policy report_forecasts_delete_editors on public.report_forecasts
  for delete to authenticated using (public.report_can_edit(workspace_id));

comment on table public.report_actuals is
  'Money received: one figure per row per month, typed from the bank account and Stripe. Not derived from anything. A negative figure is a refund or a chargeback, which is a real thing that happens to a month (Nina, 13 Nov 2026).';
comment on table public.report_forecasts is
  'Money expected: the same grid, typed or pasted across however many months it lasts. Nothing in it is generated - retainers are here because somebody put them here (Nina, 13 Nov 2026).';
