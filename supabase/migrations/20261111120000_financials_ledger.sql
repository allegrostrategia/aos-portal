-- aOS Reporting — Financials as a hand-entry ledger.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying, as every
-- migration is.
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
--   workspaces — so there is no switch and no backfill, which is a
--   kindness to every screen that would otherwise have to ask which
--   kind of client it was looking at.
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
--   screen is built to match. Underneath, each cell is a payment row
--   with its own month, because a figure that belongs to a month is how
--   the published-month lock holds anything still (7 Oct).

-- =============================================================================
-- Sales
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

-- -----------------------------------------------------------------------------
-- One cell of the grid: what this row was due in a month, and when the
-- money actually arrived.
-- -----------------------------------------------------------------------------
--
-- **Two months, and they answer different questions** (Dom, 11 Nov).
-- `due_month` is the sale: it is what the client sold, counted when they
-- sold it. `received_month` is the cash: it is what arrived, counted
-- when it arrived. A payment due in September and paid in November is
-- one row with September in one column and November in the other, and
-- the report tells the truth about both months without either figure
-- being wrong.
--
-- `received_month` null means the money has not come in. Not zero, and
-- not an absence of the sale.
create table public.report_sale_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  sales_row_id uuid not null references public.report_sales_rows (id) on delete restrict,

  due_month date not null,
  received_month date,
  amount numeric not null,

  -- Her Recurring Revenue tab splits the year into monthly payments,
  -- annual payments, and the two combined. This is the flag that split
  -- is drawn from.
  is_annual boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_sale_payments_due_is_first check (extract(day from due_month) = 1),
  constraint report_sale_payments_received_is_first
    check (received_month is null or extract(day from received_month) = 1),
  constraint report_sale_payments_amount_not_negative check (amount >= 0),
  -- One cell per row per month, which is exactly what the grid draws.
  unique (workspace_id, sales_row_id, due_month)
);

create index report_sale_payments_due_idx
  on public.report_sale_payments (workspace_id, due_month);
create index report_sale_payments_received_idx
  on public.report_sale_payments (workspace_id, received_month);

create trigger report_sale_payments_set_updated_at
  before update on public.report_sale_payments
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Expenses
-- =============================================================================

-- Every category maps to one of the four buckets the report has always
-- had, so Total costs, Profit, the margin and the donut keep working
-- without knowing the categories exist.
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
begin
  select workspace_id into v_workspace
  from public.report_expense_categories where id = new.category_id;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'An expense can only use this business''s own category';
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

  -- **The rate as it was when the hours were saved**, the same way
  -- §5.5 captures a funnel's offer price per month. Without it, a pay
  -- rise would rewrite every month that person has ever worked — and
  -- some of those months are published.
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
begin
  select workspace_id, row_type into v_row_workspace, v_row_type
  from public.report_sales_rows where id = new.sales_row_id;

  select workspace_id into v_staff_workspace
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

  return new;
end;
$$;

create trigger report_client_hours_guard_rows
  before insert or update on public.report_client_hours
  for each row execute function public.guard_report_client_hours_rows();

-- =============================================================================
-- The published-month lock
-- =============================================================================
--
-- `report_expenses` and `report_client_hours` belong to one month each,
-- so they wear the guard every other table of month content wears.

create trigger report_expenses_guard_published
  before insert or update or delete on public.report_expenses
  for each row execute function public.guard_report_published_month();

create trigger report_client_hours_guard_published
  before insert or update or delete on public.report_client_hours
  for each row execute function public.guard_report_published_month();

-- A payment has TWO months, and the ordinary guard reads one. The rule
-- it needs is the one late payments are about:
--
--   · While the DUE month is open, the row is a draft figure and
--     anything about it may change.
--   · Once the due month is published, that month's SALES figure is
--     fixed and so is the row's amount, its due month and its link.
--     **The one thing that may still change is `received_month`** —
--     a September invoice paid in November is not a change to September,
--     it is news about November.
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
       or new.sales_row_id is distinct from old.sales_row_id
       or new.is_annual is distinct from old.is_annual
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
-- Row level security — the same shape every reporting table wears
-- =============================================================================
--
-- Setup rows (the sales rows, the categories, the staff) follow
-- `report_entities`: visible to anyone granted the workspace, written by
-- an editor. Month rows follow `report_values`: a client reads them when
-- the month is published and not before.

alter table public.report_sales_rows enable row level security;
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

-- A payment is read against the month it is DUE: that is the month it
-- is a sale in, and the month whose report draws it. A payment received
-- in a month the reader may not see yet is still their own sale.
create policy report_sale_payments_all_admin on public.report_sale_payments
  for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_sale_payments_select_readers on public.report_sale_payments
  for select to authenticated using (public.report_can_read_month(workspace_id, due_month));
create policy report_sale_payments_write_editors on public.report_sale_payments
  for insert to authenticated with check (public.report_can_edit(workspace_id));
create policy report_sale_payments_update_editors on public.report_sale_payments
  for update to authenticated
  using (public.report_can_edit(workspace_id)) with check (public.report_can_edit(workspace_id));
create policy report_sale_payments_delete_editors on public.report_sale_payments
  for delete to authenticated using (public.report_can_edit(workspace_id));

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
create policy report_expenses_delete_editors on public.report_expenses
  for delete to authenticated using (public.report_can_edit(workspace_id));

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
comment on table public.report_sale_payments is
  'One cell of the sales grid: what was due in a month, and the month the money actually arrived. Sales count on due_month, cash on received_month.';
comment on table public.report_staff is
  'The client''s own team, with the rate each one costs them. Not Allegro''s staff and not Allegro''s hours - §1''s rule about that is untouched.';
comment on table public.report_client_hours is
  'Time spent on a bespoke client, for per-client profitability. The rate is captured as it was when the hours were saved, so a pay rise cannot rewrite a published month.';
