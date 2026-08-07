-- aOS — member audits.
--
-- Build Brief §1 (The audit form, Data structure), §4 (pricing dependency).
--
-- Renamed from `onboarding_audit`, because the audit is no longer one-time: a
-- member submits one at onboarding and another at their 6-month recommit, using
-- the same question structure with an updated business snapshot and current
-- pricing. Comparing the two is a feature in its own right — the first point the
-- product can show someone genuine movement in their own numbers.

create type public.audit_occasion as enum ('onboarding', 'recommit');

create table public.member_audits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  occasion public.audit_occasion not null,

  -- The multiple-choice answers, as submitted. Nina hasn't written the actual
  -- questions and options yet (§1, still her action item), so this stays jsonb
  -- rather than being modelled into columns that would need rewriting when the
  -- real question set lands. Shape: { "<question_key>": "<answer_key>", ... }.
  answers jsonb not null default '{}'::jsonb,

  -- Scores per station and per bucket, derived from `answers` when the audit is
  -- submitted. Stored rather than recomputed on read, so a historical audit still
  -- reflects the scoring rules that were in force when it was taken — otherwise
  -- changing the question set silently rewrites everyone's past diagnosis.
  -- Shape: { "station": {"<slug>": <int>}, "bucket": {"<bucket>": <int>} }.
  scores jsonb not null default '{}'::jsonb,

  -- The headline diagnostic result: which "pot" they scored weakest in (§1).
  -- Feeds the roadmap draft and the recommendation engine.
  weakest_bucket public.bucket,
  weakest_station_slug text references public.stations (slug),

  -- The business snapshot. §4 is explicit that a specific pricing/rates NUMBER is
  -- required, not a narrative answer — the pricing/leverage flag compares delivery
  -- hours against revenue-per-hour, and prose gives nothing to compare. Captured
  -- live by Nina in the 1:1 if it's missing from the form.
  current_rate numeric(12, 2),
  -- What current_rate is per: 'hour', 'session', 'package', 'month'. Free text
  -- until the question wording is settled; a rate without its basis is unusable.
  current_rate_basis text,
  monthly_revenue numeric(12, 2),

  -- Anything else the snapshot captures that isn't scored — team size, business
  -- model, delivery format. Used by the recommendation engine for relevance, and
  -- deliberately NOT used for peer pairing (§9 keeps matching on rotation only).
  business_snapshot jsonb not null default '{}'::jsonb,

  -- Null while the member is still filling it in.
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_audits_member_id_idx
  on public.member_audits (member_id, submitted_at desc);

-- One audit per member per occasion — until they cancel and rejoin, which means
-- a second 'onboarding' audit against the same row (their business has likely
-- changed, §1). So this is intentionally NOT a unique constraint; the ordering
-- index above plus `submitted_at` is how "their latest onboarding audit" is found.

create trigger member_audits_set_updated_at
  before update on public.member_audits
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.member_audits enable row level security;

-- Own audits, readable throughout — including the old one, which is the whole
-- point of the recommit comparison.
create policy member_audits_select_own
  on public.member_audits for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy member_audits_insert_own
  on public.member_audits for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

-- Editable only until submitted. After that it's a point-in-time record, and a
-- member quietly revising last year's snapshot would break the comparison.
create policy member_audits_update_own_unsubmitted
  on public.member_audits for update
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and submitted_at is null
  )
  with check (member_id = (select auth.uid()));

-- §1: Nina/team can see submitted audit data per client.
create policy member_audits_all_admin
  on public.member_audits for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
