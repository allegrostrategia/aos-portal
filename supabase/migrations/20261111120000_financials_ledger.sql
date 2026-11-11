-- aOS Reporting — Financials as a hand-entry ledger.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying, as every
-- migration is. **Revised 11 November after his review** — the six
-- changes are marked REVIEW below.
--
-- Nina, 11 November, with her own 2025 tracker as the layout reference.
-- **Nobody uploads anything.** §10's manual-entry rule stands exactly as
-- written: every sale and every expense is typed, and the reason that
-- rule exists — payment exports carry card details and put personal data
-- through aOS — is untouched by a page people type into.
--
-- WHAT REPLACES WHAT
--   Financials has had no rows at all: four typed cost totals, a typed
--   cash figure, and revenue pulled from Offers. That screen goes. The
--   check that made it safe to go is in the commit message — no real
--   client has entered a Financials figure, only the three test
--   workspaces — so there is no switch and no backfill.
--
-- SALES ROWS ARE NAMED BY THE CLIENT (Nina, 11 November)
--   Her tracker has one row per offer OR per customer: offers they sell
--   lots of get a row under the offer's name, and anybody on a retainer
--   or a bespoke package gets a row under their own. Linking a row to an
--   offer is optional, because a great many businesses — her agency
--   among them — sell mostly bespoke work that is not an offer at all.
--
--   **Names are allowed here and addresses are not.** The spreadsheet
--   has a Client Info tab with addresses and invoicing; that tab is
--   deliberately out of scope. A name on a row is what makes the row
--   findable; an address is a filing cabinet aOS has no reason to be.
--
-- THE GRID IS THE SCREEN, NOT THE STORAGE
--   Her sheet is one row per client with twelve month columns and a year
--   total, instalments written across the row as amounts. The entry
--   screen is built to match. Underneath, a sale is one record and the
--   instalments hang off it, because a figure that belongs to a month is
--   how the published-month lock holds anything still (7 Oct).

-- =============================================================================
-- Sales rows — the left-hand column of her grid
-- =============================================================================

-- Which kind of row this is. Not inferred from whether an offer is
-- linked: a row can be named after an offer the client has not set up
-- yet, and "is this a person or a product" decides whether per-client
-- profitability applies to it.
create type public.report_sales_row_type as enum ('offer', 'client');

create table public.report_sales_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,

  name text not null,
  row_type public.report_sales_row_type not null,

  -- Optional, and only on an 'offer' row. When it is set, this row's
  -- money reaches the Offers donut, the margin and the hourly rate the
  -- way a typed offer figure used to.
  offer_entity_id uuid references public.report_entities (id) on delete restrict,

  -- Retired, never deleted (rule 7): a client who left last year is the
  -- reason last year's figures are what they are.
  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_sales_rows_offer_link_only_on_offer_rows
    check (offer_entity_id is null or row_type = 'offer'),
  constraint report_sales_rows_name_not_blank check (btrim(name) <> ''),
  unique (workspace_id, name)
);

create index report_sales_rows_workspace_idx
  on public.report_sales_rows (workspace_id, sort_order);

create trigger report_sales_rows_set_updated_at
  before update on public.report_sales_rows
  for each row execute function public.set_updated_at();

-- A linked offer has to be an offer, and this client's. A foreign key
-- can only say "some entity" — the same gap, closed the same way as the
-- funnel's linked offer and the potential-revenue choice.
create or replace function public.guard_report_sales_row_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_entity_type;
  v_workspace uuid;
begin
  if new.offer_entity_id is null then
    return new;
  end if;

  select entity_type, workspace_id into v_type, v_workspace
  from public.report_entities where id = new.offer_entity_id;

  if v_type is distinct from 'offer' then
    raise exception 'A sales row can only be linked to an offer';
  end if;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'A sales row can only be linked to this business''s own offer';
  end if;

  return new;
end;
$$;

create trigger report_sales_rows_guard_offer
  before insert or update on public.report_sales_rows
  for each row execute function public.guard_report_sales_row_offer();

-- =============================================================================
-- Sales
-- =============================================================================
--
-- REVIEW 1 (Dom, 11 November): **a sale is its own record now.**
--   The first draft summed sales on the instalment's due month, so
--   £2,000 sold in September as four £500s read as £500 of sales in
--   September and £500 again in each of the next three months. That is
--   cash wearing the word "sales". A sale is what was sold, counted in
--   the month it was sold, and the schedule hangs off it:
--
--     September   Sales £2,000   Cash £500
--     October     Sales     —    Cash £500
--     November    Sales     —    Cash £500
--     December    Sales     —    Cash £500
--
--   A dash rather than £0 in October: nothing was sold, which is not the
--   same as selling nothing. The column is `month` rather than
--   `sold_month` for one reason worth more than the better name — the
--   shared published-month guard reads `new.month`, so a sale wears the
--   same lock as every other row of month content without a word of new
--   code.
--
-- REVIEW 2: **how it is billed lives here, not on a linked offer.**
--   MRR used to mean "revenue on offers marked recurring", which drops
--   every retainer on the floor — and retainers are the recurring
--   revenue for an agency like Nina's. Three values, because her
--   Recurring Revenue tab has exactly three lines: monthly payments,
--   annual payments, and the two combined.
--
--   A £2,000 course paid in four instalments is `one_off`. Instalments
--   are not recurrence: one is a way of paying, the other is a way of
--   being sold again next month.
create type public.report_sale_billing as enum ('one_off', 'monthly', 'annual');

create table public.report_sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sales_row_id uuid not null references public.report_sales_rows (id) on delete restrict,

  -- The month it was SOLD in. Named `month` so the shared guard fits.
  month date not null,
  total_value numeric not null,
  billing public.report_sale_billing not null default 'one_off',

  -- REVIEW 4: rule 7. A sale that falls through is marked, never
  -- removed — a cancelled £2,000 is a thing that happened to the
  -- business, and the report should be able to say so.
  cancelled_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_sales_month_is_first check (extract(day from month) = 1),
  constraint report_sales_value_not_negative check (total_value >= 0),
  unique (workspace_id, id)
);

create index report_sales_month_idx on public.report_sales (workspace_id, month);
create index report_sales_row_idx on public.report_sales (sales_row_id);

create trigger report_sales_set_updated_at
  before update on public.report_sales
  for each row execute function public.set_updated_at();

create trigger report_sales_guard_published
  before insert or update or delete on public.report_sales
  for each row execute function public.guard_report_published_month();

create or replace function public.guard_report_sale_row()
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
    raise exception 'A sale can only be against this business''s own row';
  end if;

  return new;
end;
$$;

create trigger report_sales_guard_row
  before insert or update on public.report_sales
  for each row execute function public.guard_report_sale_row();

-- -----------------------------------------------------------------------------
-- One cell of the grid: what is due in a month, and when it arrived.
-- -----------------------------------------------------------------------------
--
-- `due_month` is when the money was expected; `received_month` is when
-- it turned up, and that is where cash counts. A payment due in
-- September and paid in November is one row with September in one column
-- and November in the other, and the report tells the truth about both
-- months without either figure being wrong.
--
-- `received_month` null means the money has not come in. Not zero, and
-- not an absence of the sale — the sale was counted the month it was
-- sold, whatever has been paid since.
create table public.report_sale_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sale_id uuid not null references public.report_sales (id) on delete restrict,

  due_month date not null,
  received_month date,
  amount numeric not null,

  -- REVIEW 4 again: an instalment that is cancelled stops counting and
  -- stays on the record. There is no delete policy on this table, so
  -- this is the only way money leaves the ledger.
  cancelled_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_sale_payments_due_is_first check (extract(day from due_month) = 1),
  constraint report_sale_payments_received_is_first
    check (received_month is null or extract(day from received_month) = 1),
  constraint report_sale_payments_amount_not_negative check (amount >= 0),
  -- One instalment per month per sale. A client row can still show two
  -- figures in one cell of the grid, because it can have two sales.
  unique (sale_id, due_month)
);

create index report_sale_payments_due_idx
  on public.report_sale_payments (workspace_id, due_month);
create index report_sale_payments_received_idx
  on public.report_sale_payments (workspace_id, received_month);

create trigger report_sale_payments_set_updated_at
  before update on public.report_sale_payments
  for each row execute function public.set_updated_at();

create or replace function public.guard_report_sale_payment_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.report_sales where id = new.sale_id;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'A payment can only be against this business''s own sale';
  end if;

  return new;
end;
$$;

create trigger report_sale_payments_guard_sale
  before insert or update on public.report_sale_payments
  for each row execute function public.guard_report_sale_payment_sale();

-- =============================================================================
-- Expenses
-- =============================================================================

create type public.report_expense_bucket as enum (
  'fixed', 'variable', 'team', 'investment'
);

create table public.report_expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,

  name text not null,
  bucket public.report_expense_bucket not null,

  -- A default list is written for a workspace the first time it saves,
  -- and this marks which ones came that way — so "these are examples,
  -- change them" can be true on screen without being a guess.
  is_default boolean not null default false,

  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_expense_categories_name_not_blank check (btrim(name) <> ''),
  unique (workspace_id, name)
);

create index report_expense_categories_workspace_idx
  on public.report_expense_categories (workspace_id, sort_order);

create trigger report_expense_categories_set_updated_at
  before update on public.report_expense_categories
  for each row execute function public.set_updated_at();

create table public.report_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  category_id uuid not null references public.report_expense_categories (id) on delete restrict,

  month date not null,
  amount numeric not null,

  -- REVIEW 5: **the bucket as it was when this was saved.**
  --   Total costs, Profit and the margin are built on the four buckets.
  --   Moving "Software" from Fixed to Team would otherwise rewrite the
  --   composition of every published month at once. Captured per row
  --   instead — the same answer §5.5 gives for a funnel's price and the
  --   same one `rate_used` gives below — so recategorising is
  --   forward-looking, which is what somebody tidying up actually means.
  --   Filled by a trigger, never by the app.
  bucket public.report_expense_bucket not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_expenses_month_is_first check (extract(day from month) = 1),
  constraint report_expenses_amount_not_negative check (amount >= 0),
  unique (workspace_id, category_id, month)
);

create index report_expenses_workspace_idx on public.report_expenses (workspace_id, month);

create trigger report_expenses_set_updated_at
  before update on public.report_expenses
  for each row execute function public.set_updated_at();

create or replace function public.guard_report_expense_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_bucket public.report_expense_bucket;
begin
  select workspace_id, bucket into v_workspace, v_bucket
  from public.report_expense_categories where id = new.category_id;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'An expense can only use this business''s own category';
  end if;

  -- The bucket is the category's, always. An app that sent a different
  -- one is overruled rather than believed.
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    new.bucket := v_bucket;
  else
    new.bucket := old.bucket;
  end if;

  return new;
end;
$$;

create trigger report_expenses_guard_category
  before insert or update on public.report_expenses
  for each row execute function public.guard_report_expense_category();

-- =============================================================================
-- Per-client profitability
-- =============================================================================
--
-- Her Client Profitability tab is staff members with hourly rates down
-- one side and, per client per month, staff spend, what they paid, and
-- the profit between them. What is typed here is the hours; what they
-- paid is already in the grid above, so nobody enters a number twice
-- (§9's rule that two places for one figure will eventually disagree).

create table public.report_staff (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,

  name text not null,
  hourly_rate numeric not null,

  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_staff_name_not_blank check (btrim(name) <> ''),
  constraint report_staff_rate_positive check (hourly_rate > 0),
  unique (workspace_id, name)
);

create index report_staff_workspace_idx on public.report_staff (workspace_id, sort_order);

create trigger report_staff_set_updated_at
  before update on public.report_staff
  for each row execute function public.set_updated_at();

create table public.report_client_hours (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sales_row_id uuid not null references public.report_sales_rows (id) on delete restrict,
  staff_id uuid not null references public.report_staff (id) on delete restrict,

  month date not null,
  hours numeric not null,

  -- REVIEW 6: **filled by the trigger below, never by the app.**
  --   The rate as it was when the hours were saved, the same way §5.5
  --   captures a funnel's offer price per month. Without it a pay rise
  --   rewrites every month that person has ever worked, and some of
  --   those months are published. With it in the app's hands, two
  --   screens could save two different numbers for the same hour.
  rate_used numeric not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_client_hours_month_is_first check (extract(day from month) = 1),
  constraint report_client_hours_hours_not_negative check (hours >= 0),
  constraint report_client_hours_rate_positive check (rate_used > 0),
  unique (workspace_id, sales_row_id, staff_id, month)
);

create index report_client_hours_workspace_idx
  on public.report_client_hours (workspace_id, month);

create trigger report_client_hours_set_updated_at
  before update on public.report_client_hours
  for each row execute function public.set_updated_at();

create or replace function public.guard_report_client_hours_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_workspace uuid;
  v_row_type public.report_sales_row_type;
  v_staff_workspace uuid;
  v_rate numeric;
begin
  select workspace_id, row_type into v_row_workspace, v_row_type
  from public.report_sales_rows where id = new.sales_row_id;

  select workspace_id, hourly_rate into v_staff_workspace, v_rate
  from public.report_staff where id = new.staff_id;

  if v_row_workspace is distinct from new.workspace_id
     or v_staff_workspace is distinct from new.workspace_id then
    raise exception 'Hours can only be against this business''s own client and staff';
  end if;

  -- Profitability per client is what this is for. An offer's hours are
  -- already asked for on the Offers screen, and asking twice is how two
  -- answers to one question get stored.
  if v_row_type is distinct from 'client' then
    raise exception 'Hours are recorded against a client row, not an offer row';
  end if;

  -- The rate comes from the staff member, every time, and an edit to
  -- the hours leaves the rate where it was: September cost what
  -- September cost, whatever anybody is paid now.
  if tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id then
    new.rate_used := v_rate;
  else
    new.rate_used := old.rate_used;
  end if;

  return new;
end;
$$;

create trigger report_client_hours_guard_rows
  before insert or update on public.report_client_hours
  for each row execute function public.guard_report_client_hours_rows();

-- =============================================================================
-- Setup that a published month depends on
-- =============================================================================
--
-- REVIEW 5, the half a captured column cannot answer. A category's
-- bucket is frozen per expense row above, so recategorising is safe.
-- A sales row's TYPE and its offer link are not that kind of change:
-- turning a client row into an offer row moves money between the
-- bespoke slice and an offer's slice in every month at once, and there
-- is no per-month capture that makes it mean anything sensible.
--
-- So the row is held still once a published month holds money for it.
-- Admin and the service role pass, as they do on every other published
-- guard — the honest path for anybody else is unpublish, change,
-- republish.
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
    select 1
      from public.report_sales s
     where s.sales_row_id = old.id
       and public.report_month_is_locked(s.workspace_id, s.month)
  ) into v_locked;

  if v_locked then
    raise exception 'That row has sales in a published month. Unpublish it to change what kind of row it is.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger report_sales_rows_guard_published
  before update on public.report_sales_rows
  for each row execute function public.guard_report_sales_row_published();

-- =============================================================================
-- The published-month lock
-- =============================================================================
--
-- `report_sales`, `report_expenses` and `report_client_hours` each
-- belong to one month, so they wear the guard every other table of
-- month content wears.

create trigger report_expenses_guard_published
  before insert or update or delete on public.report_expenses
  for each row execute function public.guard_report_published_month();

create trigger report_client_hours_guard_published
  before insert or update or delete on public.report_client_hours
  for each row execute function public.guard_report_published_month();

-- A payment has TWO months, and the ordinary guard reads one. The rule
-- it needs is the one late payments are about:
--
--   · While the DUE month is open, anything about the row may change.
--   · Once the due month is published, the amount, the month, the sale
--     and whether it was cancelled are all part of what that report
--     said, and are held still. **The one thing that may still change
--     is `received_month`** — a September invoice paid in November is
--     not a change to September, it is news about November.
--   · And the month the cash lands in has to be open itself, in both
--     directions: moving cash out of a published month is as much a
--     rewrite of it as moving cash in.
create or replace function public.guard_report_sale_payment_months()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  -- Admin and the service role pass, as they must: the cron and after()
  -- jobs have no JWT, so is_portal_admin() is false for them.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_workspace := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;

  -- Cash may not be moved into or out of a published month.
  if tg_op <> 'INSERT' and old.received_month is not null
     and public.report_month_is_locked(v_workspace, old.received_month) then
    raise exception 'That month is published. Unpublish it to change when the money arrived.'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' and new.received_month is not null
     and public.report_month_is_locked(v_workspace, new.received_month) then
    raise exception 'That month is published. Unpublish it to change when the money arrived.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    if public.report_month_is_locked(v_workspace, old.due_month) then
      raise exception 'That month is published. Unpublish it to make changes.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if public.report_month_is_locked(v_workspace, new.due_month) then
      raise exception 'That month is published. Unpublish it to make changes.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE on a published due month: everything but the received month
  -- is held still, and moving the row to a different due month is a
  -- change to both of them.
  if public.report_month_is_locked(v_workspace, old.due_month)
     or public.report_month_is_locked(v_workspace, new.due_month) then
    if new.amount is distinct from old.amount
       or new.due_month is distinct from old.due_month
       or new.sale_id is distinct from old.sale_id
       or new.cancelled_on is distinct from old.cancelled_on
       or new.workspace_id is distinct from old.workspace_id then
      raise exception 'That month is published. Only when the money arrived can still change.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_report_sale_payment_months() is
  'A payment belongs to the month it was due and to the month it was paid. A published due month fixes everything but received_month, so a late payment can still be recorded against an open month (11 Nov 2026).';

create trigger report_sale_payments_guard_published
  before insert or update or delete on public.report_sale_payments
  for each row execute function public.guard_report_sale_payment_months();

-- =============================================================================
-- Row level security
-- =============================================================================
--
-- Setup rows (the sales rows, the categories, the staff) follow
-- `report_entities`: visible to anyone granted the workspace, written by
-- an editor. Month rows follow `report_values`: a client reads them when
-- the month is published and not before.

alter table public.report_sales_rows enable row level security;
alter table public.report_sales enable row level security;
alter table public.report_sale_payments enable row level security;
alter table public.report_expense_categories enable row level security;
alter table public.report_expenses enable row level security;
alter table public.report_staff enable row level security;
alter table public.report_client_hours enable row level security;

create policy report_sales_rows_all_admin on public.report_sales_rows
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_sales_rows_select_granted on public.report_sales_rows
  for select to authenticated using (public.report_can_view(workspace_id));
create policy report_sales_rows_write_editors on public.report_sales_rows
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_sales_rows_update_editors on public.report_sales_rows
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));

create policy report_sales_all_admin on public.report_sales
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_sales_select_readers on public.report_sales
  for select to authenticated using (public.report_can_read_month(workspace_id, month));
create policy report_sales_write_editors on public.report_sales
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_sales_update_editors on public.report_sales
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));

-- REVIEW 3: **which payments a client may see.**
--   Reading by the due month alone was wrong twice over. A sale made in
--   a published September schedules instalments into October, November
--   and December, and those are part of what September's report says
--   about the months ahead — hiding them left "scheduled ahead" empty
--   for the only person it was written for. And an instalment paid
--   EARLY, into a published month, dropped out of that month's cash
--   because its due month had not been published yet.
--
--   So a payment is readable when any one of the three months it can be
--   attached to is readable: the month its sale was made, the month it
--   is due, or the month the money arrived. Each of those is a month
--   the client has either already been shown or is entitled to.
create or replace function public.report_can_read_payment(
  p_workspace uuid,
  p_sale uuid,
  p_due date,
  p_received date
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.report_can_read_month(p_workspace, p_due)
      or (p_received is not null and public.report_can_read_month(p_workspace, p_received))
      or exists (
           select 1 from public.report_sales s
            where s.id = p_sale
              and public.report_can_read_month(p_workspace, s.month)
         );
$$;

comment on function public.report_can_read_payment(uuid, uuid, date, date) is
  'A payment is readable when the month of its sale, its due month or the month it arrived is readable. Any one of the three is a month the client has been shown (11 Nov 2026).';

create policy report_sale_payments_all_admin on public.report_sale_payments
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_sale_payments_select_readers on public.report_sale_payments
  for select to authenticated
  using (public.report_can_read_payment(workspace_id, sale_id, due_month, received_month));
create policy report_sale_payments_write_editors on public.report_sale_payments
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_sale_payments_update_editors on public.report_sale_payments
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
-- **No delete policy, on purpose** (REVIEW 4). Money leaves this ledger
-- by being cancelled, which keeps the record of it; rule 7, applied to
-- the one table where a removed row is a removed fact about a person.

create policy report_expense_categories_all_admin on public.report_expense_categories
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_expense_categories_select_granted on public.report_expense_categories
  for select to authenticated using (public.report_can_view(workspace_id));
create policy report_expense_categories_write_editors on public.report_expense_categories
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_expense_categories_update_editors on public.report_expense_categories
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));

create policy report_expenses_all_admin on public.report_expenses
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_expenses_select_readers on public.report_expenses
  for select to authenticated using (public.report_can_read_month(workspace_id, month));
create policy report_expenses_write_editors on public.report_expenses
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_expenses_update_editors on public.report_expenses
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
-- An expense cell cleared is a cell nobody meant: there is no
-- counterparty and no agreement, so the delete that `report_top_items`
-- already allows for a mistyped line is right here too.
create policy report_expenses_delete_editors on public.report_expenses
  for delete to authenticated using (public.report_can_edit(workspace_id));

-- **These are the client's own staff, not Allegro's.** The tracker this
-- is modelled on belongs to the business being reported on: its own team
-- down one side, its own clients across the top. So the rows follow the
-- same rule as every other piece of setup — visible to anybody granted
-- the workspace, written by an editor.
--
-- Which also means §1's "nothing about Allegro's work. No hours used"
-- is untouched: nothing here records what ALLEGRO spent on anybody.
create policy report_staff_all_admin on public.report_staff
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_staff_select_granted on public.report_staff
  for select to authenticated using (public.report_can_view(workspace_id));
create policy report_staff_write_editors on public.report_staff
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_staff_update_editors on public.report_staff
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));

-- Read with the month, like every other figure: a draft is the team's
-- working-out and a published month is the client's to read. It is
-- their own business's time against their own business's clients.
create policy report_client_hours_all_admin on public.report_client_hours
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_client_hours_select_readers on public.report_client_hours
  for select to authenticated using (public.report_can_read_month(workspace_id, month));
create policy report_client_hours_write_editors on public.report_client_hours
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_client_hours_update_editors on public.report_client_hours
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
create policy report_client_hours_delete_editors on public.report_client_hours
  for delete to authenticated using (public.report_can_edit(workspace_id));

comment on table public.report_sales_rows is
  'One row per offer or per customer, named by the client. Linking to an offer is optional - plenty of businesses sell bespoke work that is not an offer (Nina, 11 Nov 2026).';
comment on table public.report_sales is
  'A sale: what was sold, in the month it was sold. Its instalments hang off it in report_sale_payments, and how it is billed - one off, monthly or annual - is what MRR is drawn from.';
comment on table public.report_sale_payments is
  'One instalment: the month it is due, and the month the money actually arrived. Cash counts on received_month; the sale was already counted when it was made.';
comment on table public.report_staff is
  'The client''s own team, with the rate each one costs them. Not Allegro''s staff and not Allegro''s hours - §1''s rule about that is untouched.';
comment on table public.report_client_hours is
  'Time spent on a bespoke client, for per-client profitability. The rate is filled from the staff member by a trigger, so a pay rise cannot rewrite a published month.';
