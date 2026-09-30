-- aOS Reporting Tool — Trial Reels' top-3 lists.
--
-- Brief §5.3. Text plus a view count per item, which is why these are not
-- rows in report_values: a numeric metric has nowhere to put the hook.
--
-- "Proven" (a hook or b-roll in the top 3 in two or more months) is worked
-- out at read time from these rows, not stored. It would otherwise need
-- recomputing every time an earlier month was corrected.

create type public.report_top_item_type as enum ('hook', 'b_roll');

create table public.report_top_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,

  item_type public.report_top_item_type not null,
  rank smallint not null,

  body text not null,
  views integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_top_items_month_is_first check (extract(day from month) = 1),
  constraint report_top_items_rank_range check (rank between 1 and 3),
  unique (workspace_id, month, item_type, rank)
);

create index report_top_items_workspace_idx
  on public.report_top_items (workspace_id, month);

-- Matching a hook against earlier months is the whole "Proven" rule, and it
-- is a text comparison across every month of one workspace.
create index report_top_items_body_idx
  on public.report_top_items (workspace_id, item_type, body);

create trigger report_top_items_set_updated_at
  before update on public.report_top_items
  for each row
  execute function public.set_updated_at();

alter table public.report_top_items enable row level security;

create policy report_top_items_all_admin
  on public.report_top_items for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy report_top_items_select_readers
  on public.report_top_items for select to authenticated
  using (public.report_can_read_month(workspace_id, month));

create policy report_top_items_write_editors
  on public.report_top_items for insert to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_top_items_update_editors
  on public.report_top_items for update to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));
