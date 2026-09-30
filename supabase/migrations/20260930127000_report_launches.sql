-- aOS Reporting Tool — the Launches module.
--
-- Brief §6, built from Nina's existing launch tracker. Numbers only: no
-- attendee names, no contact details, anywhere in these four tables.
--
-- A launch is not tied to a month (§6), so it cannot hang off report_periods
-- the way every other figure does. JUDGEMENT CALL, FLAGGED FOR NINA: a launch
-- gets its own `published_at` on the same rule as a monthly report — a
-- retainer client sees it once Nina publishes it, a self-serve client always
-- sees their own. The brief does not say either way, and the alternative was
-- a retainer client watching their launch page fill in while Elize was still
-- typing.

create type public.report_launch_status as enum ('planning', 'live', 'completed');

create type public.report_launch_stage_type as enum (
  'challenge', 'masterclass', 'webinar', 'workshop', 'waitlist', 'open_cart', 'other'
);

create table public.report_launches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,

  name text not null,
  description text,

  -- §6.1: "the offer it sells (links to Offers)".
  offer_entity_id uuid references public.report_entities (id) on delete set null,

  status public.report_launch_status not null default 'planning',
  cover_image_path text,

  -- §6.1: Good, Better and Best sales targets.
  goal_good integer,
  goal_better integer,
  goal_best integer,

  -- §6.6: a first launch has no history, so the client types the rates the
  -- planner works backwards from. Later launches offer their real ones.
  planner_show_up_rate numeric,
  planner_conversion_rate numeric,

  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_launches_goals_ascend
    check (
      (goal_good is null or goal_better is null or goal_better >= goal_good)
      and (goal_better is null or goal_best is null or goal_best >= goal_better)
    ),
  constraint report_launches_published_by_who
    check ((published_at is null) = (published_by is null)),
  unique (workspace_id, name)
);

create index report_launches_workspace_idx on public.report_launches (workspace_id, status);

create trigger report_launches_set_updated_at
  before update on public.report_launches
  for each row
  execute function public.set_updated_at();

create table public.report_launch_stages (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.report_launches (id) on delete cascade,

  position smallint not null,
  stage_type public.report_launch_stage_type not null,
  name text not null,

  promo_start date,
  promo_end date,
  live_start date,
  live_end date,

  -- §6.1: "A challenge sets its number of days." Also what tells the stage
  -- numbers page how many "live attendees per day" boxes to draw.
  live_days smallint,

  sign_up_goal integer,
  attendance_goal integer,

  -- §6.4's conversion rate is "total sales ÷ live attendees of the main
  -- selling stage", so exactly one stage has to be nameable as that one.
  is_main_selling_stage boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (launch_id, position),
  constraint report_launch_stages_dates_order
    check (
      (promo_start is null or promo_end is null or promo_end >= promo_start)
      and (live_start is null or live_end is null or live_end >= live_start)
    ),
  constraint report_launch_stages_live_days_positive
    check (live_days is null or live_days > 0)
);

create unique index report_launch_stages_one_main
  on public.report_launch_stages (launch_id)
  where is_main_selling_stage;

create index report_launch_stages_launch_idx on public.report_launch_stages (launch_id, position);

create trigger report_launch_stages_set_updated_at
  before update on public.report_launch_stages
  for each row
  execute function public.set_updated_at();

create table public.report_launch_prices (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.report_launches (id) on delete cascade,

  name text not null,
  price numeric not null,

  -- §6.1: "A payment plan also stores number of instalments and instalment
  -- amount." §6.4 counts payment plans at full contract value, so `price` is
  -- the contract value and these two describe how it is paid.
  instalments smallint,
  instalment_amount numeric,

  -- §6.1: "Revenue for each [goal] = sales target × main price."
  is_main boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (launch_id, name),
  constraint report_launch_prices_instalments_pair
    check ((instalments is null) = (instalment_amount is null)),
  constraint report_launch_prices_instalments_positive
    check (instalments is null or instalments > 1)
);

create unique index report_launch_prices_one_main
  on public.report_launch_prices (launch_id)
  where is_main;

create index report_launch_prices_launch_idx on public.report_launch_prices (launch_id);

create trigger report_launch_prices_set_updated_at
  before update on public.report_launch_prices
  for each row
  execute function public.set_updated_at();

-- Every launch figure, in the same shape as report_values: a metric key plus
-- whatever context that particular number needs. §6.2's attendance is per
-- stage per day, §6.3's email stats are per stage per email, §6.4's sales are
-- per price option — one table with three optional context columns rather
-- than a table per subsection.
create table public.report_launch_values (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.report_launches (id) on delete cascade,

  stage_id uuid references public.report_launch_stages (id) on delete cascade,
  price_id uuid references public.report_launch_prices (id) on delete cascade,

  metric_key text not null references public.report_metrics (key),

  -- §6.2 "Live attendees per day: one field per live day"; §6.3 one row per
  -- email in a stage's sequence.
  day_number smallint,
  email_number smallint,

  value numeric,

  entered_by uuid references auth.users (id) on delete set null,
  entered_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_launch_values_day_positive
    check (day_number is null or day_number > 0),
  constraint report_launch_values_email_positive
    check (email_number is null or email_number > 0)
);

create unique index report_launch_values_one_per_cell
  on public.report_launch_values (
    launch_id,
    metric_key,
    coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(price_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(day_number, 0),
    coalesce(email_number, 0)
  );

create index report_launch_values_launch_idx on public.report_launch_values (launch_id);

create trigger report_launch_values_set_updated_at
  before update on public.report_launch_values
  for each row
  execute function public.set_updated_at();

-- Integrity, not permission: no service-role escape, for the reason spelled
-- out over report_values' guard.
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

  return new;
end;
$$;

create trigger report_launch_values_guard
  before insert or update on public.report_launch_values
  for each row
  execute function public.guard_report_launch_value();

-- ---------------------------------------------------------------------------
-- Access. Every child table reaches its workspace through its launch, so the
-- lookup is written once here rather than joined in eight policies.
-- ---------------------------------------------------------------------------

create or replace function public.report_launch_workspace(p_launch_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select workspace_id from public.report_launches where id = p_launch_id;
$$;

create or replace function public.report_can_read_launch(p_launch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.report_can_view(public.report_launch_workspace(p_launch_id))
    and (
      public.report_can_edit(public.report_launch_workspace(p_launch_id))
      or exists (
        select 1 from public.report_launches l
        join public.report_workspaces w on w.id = l.workspace_id
        where l.id = p_launch_id
          and (w.kind <> 'retainer' or l.published_at is not null)
      )
    );
$$;

create or replace function public.report_can_edit_launch(p_launch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.report_can_edit(public.report_launch_workspace(p_launch_id));
$$;

alter table public.report_launches enable row level security;
alter table public.report_launch_stages enable row level security;
alter table public.report_launch_prices enable row level security;
alter table public.report_launch_values enable row level security;

create policy report_launches_all_admin
  on public.report_launches for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy report_launches_select_readers
  on public.report_launches for select to authenticated
  using (
    public.report_can_view(workspace_id)
    and (
      public.report_can_edit(workspace_id)
      or published_at is not null
      or exists (
        select 1 from public.report_workspaces w
        where w.id = workspace_id and w.kind <> 'retainer'
      )
    )
  );

create policy report_launches_write_editors
  on public.report_launches for insert to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_launches_update_editors
  on public.report_launches for update to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

-- Publishing a launch is Nina's, exactly as publishing a month is.
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
    if new.published_at is not null or new.published_by is not null then
      raise exception 'Only an admin can publish a launch report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
  then
    raise exception 'Only an admin can publish a launch report';
  end if;

  return new;
end;
$$;

create trigger report_launches_guard_publish
  before insert or update on public.report_launches
  for each row
  execute function public.guard_report_launch_publish();

create policy report_launch_stages_all_admin
  on public.report_launch_stages for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_launch_stages_select_readers
  on public.report_launch_stages for select to authenticated
  using (public.report_can_read_launch(launch_id));
create policy report_launch_stages_write_editors
  on public.report_launch_stages for insert to authenticated
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_stages_update_editors
  on public.report_launch_stages for update to authenticated
  using (public.report_can_edit_launch(launch_id))
  with check (public.report_can_edit_launch(launch_id));

create policy report_launch_prices_all_admin
  on public.report_launch_prices for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_launch_prices_select_readers
  on public.report_launch_prices for select to authenticated
  using (public.report_can_read_launch(launch_id));
create policy report_launch_prices_write_editors
  on public.report_launch_prices for insert to authenticated
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_prices_update_editors
  on public.report_launch_prices for update to authenticated
  using (public.report_can_edit_launch(launch_id))
  with check (public.report_can_edit_launch(launch_id));

create policy report_launch_values_all_admin
  on public.report_launch_values for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_launch_values_select_readers
  on public.report_launch_values for select to authenticated
  using (public.report_can_read_launch(launch_id));
create policy report_launch_values_write_editors
  on public.report_launch_values for insert to authenticated
  with check (public.report_can_edit_launch(launch_id));
create policy report_launch_values_update_editors
  on public.report_launch_values for update to authenticated
  using (public.report_can_edit_launch(launch_id))
  with check (public.report_can_edit_launch(launch_id));
