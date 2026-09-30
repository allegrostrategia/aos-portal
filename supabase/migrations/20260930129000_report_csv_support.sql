-- aOS Reporting Tool — CSV import support, and reminder bookkeeping.
--
-- Brief §10 and §8.1.
--
-- The uploaded file is never stored, only the numbers taken from it (§10) —
-- these tables are the audit trail of what an upload filled and the saved
-- column choices that stop it asking the same question twice. There is no
-- storage bucket for reporting, on purpose: a Meta export is one row per post
-- with captions in it, and §6 is emphatic that this tool holds numbers only.

create type public.report_csv_platform as enum ('meta_content', 'meta_ads');

-- §10.2: an unrecognised conversion column is either leads, purchases, or
-- nothing. "Ignored" is a real answer that has to be remembered, or the
-- client is asked about the same column every month.
create type public.report_column_mapping as enum ('leads', 'purchases', 'ignored');

create table public.report_csv_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,

  file_name text not null,
  platform public.report_csv_platform not null,
  month date not null,
  uploaded_by uuid references auth.users (id) on delete set null,

  -- Which metric keys this import actually filled. An audit trail, so a
  -- figure that looks wrong can be traced to the upload that put it there.
  fields_filled text[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint report_csv_imports_month_is_first check (extract(day from month) = 1)
);

create index report_csv_imports_workspace_idx
  on public.report_csv_imports (workspace_id, month desc);

create table public.report_column_maps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  platform public.report_csv_platform not null,

  column_name text not null,
  maps_to public.report_column_mapping not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, platform, column_name)
);

create trigger report_column_maps_set_updated_at
  before update on public.report_column_maps
  for each row
  execute function public.set_updated_at();

-- §8.1's two Piazza notifications, and nothing else: "No further reminders
-- after that." This table is what makes that true across cron runs.
create table public.report_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,

  -- 1 = the 1st of the month, 2 = the 8th, sent only if the report isn't done.
  reminder smallint not null,
  sent_at timestamptz not null default now(),

  unique (workspace_id, month, reminder),
  constraint report_reminders_month_is_first check (extract(day from month) = 1),
  constraint report_reminders_which check (reminder in (1, 2))
);

alter table public.report_csv_imports enable row level security;
alter table public.report_column_maps enable row level security;
alter table public.report_reminders enable row level security;

create policy report_csv_imports_all_admin
  on public.report_csv_imports for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
-- Read and add, never change or remove. This is the audit trail that says
-- where a figure came from — "a wrong number was uploaded from this file on
-- this date" is the question it exists to answer, and a row an editor can
-- tidy away answers it only until somebody tidies. Rule 7, applied to the
-- record of an action rather than to a member's content.
create policy report_csv_imports_select_editors
  on public.report_csv_imports for select to authenticated
  using (public.report_can_edit(workspace_id));
create policy report_csv_imports_insert_editors
  on public.report_csv_imports for insert to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_column_maps_all_admin
  on public.report_column_maps for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy report_column_maps_editors
  on public.report_column_maps for all to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

-- Dedupe bookkeeping, written by the daily cron under the service role, which
-- bypasses RLS entirely — so there is no policy here admitting it, and adding
-- one with `auth.uid() is null` would be cargo cult: that clause belongs in
-- TRIGGERS, where the service role is genuinely subject to the check. Nothing
-- in here is for a client to read.
create policy report_reminders_all_admin
  on public.report_reminders for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());
