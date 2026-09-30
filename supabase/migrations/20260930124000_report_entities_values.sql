-- aOS Reporting Tool — the repeatable things, and every typed number.
--
-- Brief §9. One value per workspace + month + metric + entity; saving again
-- updates rather than duplicating.

-- §5.9: an offer is one-off or recurring, and "Units sold" is labelled
-- "Members" on a recurring offer's card.
create type public.report_pricing_model as enum ('one_off', 'recurring');

-- §5.7 / §10.2: a campaign's goal decides whether its spend counts towards
-- cost per lead. In Emily's sample, £124.65 of profile-visit spend dragged
-- cost per lead from £4.16 to £5.42 — the whole reason this column exists.
create type public.report_campaign_goal as enum (
  'leads', 'sales', 'profile_visits', 'traffic', 'awareness'
);

create table public.report_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  entity_type public.report_entity_type not null,
  name text not null,

  -- Rule 7 reaches here too: retiring an offer is `active = false`, never a
  -- delete, so last year's months keep the offer their figures belong to.
  active boolean not null default true,
  sort_order integer not null default 0,

  -- Offer setup (§5.9): "name, price, type (one-off or recurring), hourly
  -- cost of the client's own delivery time."
  price numeric,
  pricing_model public.report_pricing_model,
  hourly_cost numeric,

  -- Funnel setup (§5.5): "Each funnel is linked to one offer." Its purchases
  -- are a subset of that offer's sales, not extra ones.
  linked_offer_id uuid references public.report_entities (id) on delete set null,

  -- Ad campaign setup (§5.7).
  campaign_goal public.report_campaign_goal,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Each type carries only its own setup. Without these, a funnel with an
  -- hourly cost is storable and silently meaningless.
  constraint report_entities_offer_fields
    check (entity_type = 'offer' or (price is null and pricing_model is null and hourly_cost is null)),
  constraint report_entities_funnel_fields
    check (entity_type = 'funnel' or linked_offer_id is null),
  constraint report_entities_campaign_fields
    check (entity_type = 'ad_campaign' or campaign_goal is null),
  constraint report_entities_no_self_link
    check (linked_offer_id is null or linked_offer_id <> id),

  unique (workspace_id, entity_type, name)
);

create index report_entities_workspace_idx
  on public.report_entities (workspace_id, entity_type, sort_order);

create trigger report_entities_set_updated_at
  before update on public.report_entities
  for each row
  execute function public.set_updated_at();

-- A funnel's linked offer has to be an offer, and has to belong to the same
-- business. A foreign key can say "some entity"; only this can say which.
create or replace function public.guard_report_entity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_entity_type;
  v_workspace uuid;
begin
  if new.linked_offer_id is null then
    return new;
  end if;

  select entity_type, workspace_id into v_type, v_workspace
  from public.report_entities where id = new.linked_offer_id;

  if v_type <> 'offer' then
    raise exception 'A funnel can only be linked to an offer';
  end if;

  if v_workspace <> new.workspace_id then
    raise exception 'A funnel can only be linked to an offer in the same workspace';
  end if;

  return new;
end;
$$;

create trigger report_entities_guard_link
  before insert or update on public.report_entities
  for each row
  execute function public.guard_report_entity_link();

-- =============================================================================
-- report_values — every typed number
-- =============================================================================

create table public.report_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,
  metric_key text not null references public.report_metrics (key),

  -- Null = the figure for the month as a whole. Set = this offer's, this
  -- funnel's, this campaign's. §5.7 needs both at once: the account totals
  -- and the same fields per named campaign.
  entity_id uuid references public.report_entities (id) on delete cascade,

  value numeric,

  source public.report_value_source not null default 'manual',
  entered_by uuid references auth.users (id) on delete set null,
  entered_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_values_month_is_first check (extract(day from month) = 1)
);

-- §9's unique rule. A plain unique constraint would NOT enforce it when
-- entity_id is null, because Postgres treats every null as distinct — two
-- month-level rows for the same metric would both be accepted and the report
-- would show whichever came back first. Coalescing to a fixed nil uuid closes
-- it. (Inherited from the earlier draft of this schema, which got this right.)
create unique index report_values_one_per_cell
  on public.report_values (
    workspace_id, month, metric_key,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index report_values_workspace_month_idx
  on public.report_values (workspace_id, month);

create trigger report_values_set_updated_at
  before update on public.report_values
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- What may be stored at all.
--
-- §9: "Calculated values are not stored." §4: "enter once, use everywhere."
-- Both are easy to honour on the day and easy to break in six months with a
-- convenient insert, so they are facts about the table rather than habits.
--
-- NOTE for whoever edits this next: this guard deliberately has NO
-- `auth.uid() is null` service-role escape. The escapes elsewhere in this
-- codebase are on PERMISSION guards, where the system legitimately writes a
-- column a member may not. This is an INTEGRITY guard — storing a calculated
-- figure is just as wrong when the cron does it.
-- ---------------------------------------------------------------------------

create or replace function public.guard_report_value_metric()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_type public.report_input_type;
  v_entity_type public.report_entity_type;
  v_actual_type public.report_entity_type;
  v_entity_workspace uuid;
begin
  select input_type, entity_type into v_input_type, v_entity_type
  from public.report_metrics where key = new.metric_key;

  if v_input_type in ('calc', 'pulled') then
    raise exception 'Metric % is %, so it is worked out rather than stored (brief §9)',
      new.metric_key, v_input_type;
  end if;

  if new.entity_id is not null then
    select entity_type, workspace_id into v_actual_type, v_entity_workspace
    from public.report_entities where id = new.entity_id;

    if v_entity_workspace <> new.workspace_id then
      raise exception 'That entity belongs to a different workspace';
    end if;

    -- The metric's entity_type is what it MAY be broken down by. A value with
    -- no entity is always allowed — that is the account-level figure.
    if v_entity_type is null or v_actual_type <> v_entity_type then
      raise exception 'Metric % cannot be broken down by a %', new.metric_key, v_actual_type;
    end if;
  end if;

  return new;
end;
$$;

create trigger report_values_guard_metric
  before insert or update on public.report_values
  for each row
  execute function public.guard_report_value_metric();

alter table public.report_entities enable row level security;
alter table public.report_values enable row level security;

create policy report_entities_all_admin
  on public.report_entities for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- Entities are setup, not monthly figures, so they carry no publish gate: a
-- retainer client seeing the list of their own offers before a month is
-- published tells them nothing they did not already know about their own
-- business.
create policy report_entities_select_granted
  on public.report_entities for select
  to authenticated
  using (public.report_can_view(workspace_id));

create policy report_entities_write_editors
  on public.report_entities for insert
  to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_entities_update_editors
  on public.report_entities for update
  to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

create policy report_values_all_admin
  on public.report_values for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- One expression, defined once in 20260930121000_report_periods.sql: an
-- editor reads their own draft, a client reads a published month, and a
-- self-serve member always reads their own.
create policy report_values_select_readers
  on public.report_values for select
  to authenticated
  using (public.report_can_read_month(workspace_id, month));

create policy report_values_write_editors
  on public.report_values for insert
  to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_values_update_editors
  on public.report_values for update
  to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));
