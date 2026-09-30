-- aOS Reporting Tool — the master field list.
--
-- Brief §9: "a new field or a new category is a new row in the metric list,
-- not a database change." This table is that list. It is reference data —
-- labels and metadata, never anybody's figures — so every authenticated user
-- reads all of it, the same as training_content and the other lookup tables.
--
-- Calculated fields get rows too, even though §9 is emphatic that calculated
-- values are never stored. A calc metric is still something a target or a
-- benchmark points at (§7's benchmark list is almost entirely rates), and the
-- Overview's target bars are drawn against Ad ROAS and Email Sign Ups. The
-- row is the field's identity; `report_values` is where a figure would live,
-- and a calc metric never gets one. The check constraint at the bottom of
-- `report_values` is what keeps that honest.

create table public.report_metrics (
  -- `<category>_<slugified label>`, e.g. social_media_reach,
  -- offers_effective_hourly_rate. Long, and worth it: one flat namespace with
  -- no collisions between ads_link_clicks and social_media_link_clicks, a
  -- single-column foreign key, and a key that is safe to write as a plain
  -- object property in the formula module.
  key text primary key,

  category public.report_category not null,
  label text not null,
  input_type public.report_input_type not null,
  unit public.report_unit not null,
  good_direction public.report_good_direction not null,

  -- Set when the metric belongs to a repeatable thing rather than to the
  -- month as a whole: one row per offer, per funnel, per ad campaign. Null
  -- means workspace-level. `report_values` checks its entity against this.
  entity_type public.report_entity_type,

  -- The brief's own words for how a calc field is worked out, carried through
  -- so the entry page can show "Saves ÷ reach" under the number without
  -- anyone retyping it. Documentation only — the arithmetic lives in
  -- src/lib/reporting/formulas.ts, which is the single source §9 requires.
  formula text,

  -- Display order within a category, following the order of the brief's
  -- tables so the entry page reads the way the spec does.
  sort_order integer not null,

  created_at timestamptz not null default now(),

  -- A calc metric is derived and a pulled metric comes from another category;
  -- neither is ever typed, so neither may carry a formula-free definition of
  -- itself by accident.
  constraint report_metrics_calc_has_formula
    check (input_type <> 'calc' or formula is not null),
  unique (category, sort_order)
);

create index report_metrics_category_idx on public.report_metrics (category, sort_order);

alter table public.report_metrics enable row level security;

create policy report_metrics_select_all
  on public.report_metrics for select
  to authenticated
  using (true);

create policy report_metrics_all_admin
  on public.report_metrics for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
