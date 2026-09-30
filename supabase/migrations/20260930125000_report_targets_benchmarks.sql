-- aOS Reporting Tool — targets and benchmarks.
--
-- Brief §7. Both feed the traffic lights, and the order matters: a metric is
-- judged against its target if it has one, otherwise its benchmark, otherwise
-- last month. The rules themselves live in src/lib/reporting/formulas.ts —
-- this is only where the numbers are kept.
--
-- Who sets them (§7): "Retainer clients' targets are set by Allegro; aOS
-- members set their own." That is exactly report_can_edit(), which is already
-- false for a retainer client, so it needs no special case here.

create table public.report_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  metric_key text not null references public.report_metrics (key),
  entity_id uuid references public.report_entities (id) on delete cascade,

  -- §7: "A target can be one monthly figure or change by month." Null is the
  -- standing figure that applies to every month without one of its own.
  month date,

  target_value numeric not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_targets_month_is_first
    check (month is null or extract(day from month) = 1)
);

-- Same null-is-distinct trap as report_values, twice over: a standing target
-- and a per-entity target both leave a null in the key.
create unique index report_targets_one_per_cell
  on public.report_targets (
    workspace_id, metric_key,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(month, '0001-01-01'::date)
  );

create index report_targets_workspace_idx on public.report_targets (workspace_id, metric_key);

create trigger report_targets_set_updated_at
  before update on public.report_targets
  for each row
  execute function public.set_updated_at();

create table public.report_benchmarks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  metric_key text not null references public.report_metrics (key),

  benchmark_value numeric not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One industry average per metric per client. No month: §7 sets these per
  -- niche at first-time setup and they stay editable, but they do not vary
  -- month to month the way a target does.
  unique (workspace_id, metric_key)
);

create trigger report_benchmarks_set_updated_at
  before update on public.report_benchmarks
  for each row
  execute function public.set_updated_at();

alter table public.report_targets enable row level security;
alter table public.report_benchmarks enable row level security;

create policy report_targets_all_admin
  on public.report_targets for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- A target FOR a month is part of that month's unpublished working-out, so it
-- waits for the publish. A standing target is not about any one month and is
-- visible as soon as it is set — that is the number the client agreed to.
create policy report_targets_select_readers
  on public.report_targets for select
  to authenticated
  using (
    case
      when month is null then public.report_can_view(workspace_id)
      else public.report_can_read_month(workspace_id, month)
    end
  );

create policy report_targets_write_editors
  on public.report_targets for insert
  to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_targets_update_editors
  on public.report_targets for update
  to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

create policy report_benchmarks_all_admin
  on public.report_benchmarks for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- No month to gate on, and nothing month-specific in it: an industry average
-- for the client's niche is reference data about their market.
create policy report_benchmarks_select_granted
  on public.report_benchmarks for select
  to authenticated
  using (public.report_can_view(workspace_id));

create policy report_benchmarks_write_editors
  on public.report_benchmarks for insert
  to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_benchmarks_update_editors
  on public.report_benchmarks for update
  to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));
