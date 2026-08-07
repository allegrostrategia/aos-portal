-- aOS — the training library.
--
-- Build Brief §6 (Training library), §11 (Export rules).
-- Full content inventory and station mapping: Training_Library_Grouping.md.
--
-- Organised by STATION. Every training lives in exactly one station — that is the
-- browsing structure a member experiences. Bucket and sub-category are secondary
-- tags feeding the recommendation engine, never the navigation (§6).

-- What kind of thing this is. §6 is explicit that these must be visually
-- distinguishable: a member should never mistake someone's actual live build for
-- a structured lesson.
create type public.content_kind as enum (
  'training',    -- pre-recorded formal library content
  'replay',      -- a real hot seat build, clipped from Zoom (a manual production step)
  'audio_drop'   -- Nina's weekly audio drop, living in Cinema Allegro
);

-- The format, shown as a badge before anyone clicks in, so nobody opens something
-- expecting one thing and gets another (§6).
create type public.content_format as enum (
  'video',
  'pdf',
  'audio',
  'spreadsheet'
);

-- The second tagging layer: what this content is FOR. Feeds the diagnostic
-- recommendation engine directly (§6).
create type public.content_job as enum ('save_time', 'make_money');

create table public.training_content (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  slug text not null unique,
  description text,

  -- Exactly one station. Not nullable, not many-to-many — this is the organising
  -- principle, and content that belongs everywhere belongs nowhere.
  station_slug text not null references public.stations (slug),

  -- Layer one: topic.
  bucket public.bucket,
  sub_category text,
  -- Layer two: job.
  job public.content_job,

  kind public.content_kind not null default 'training',
  format public.content_format not null default 'video',

  -- Where the asset actually lives. Never exposed as a download link for formal
  -- content — see the export note at the foot of this file.
  asset_path text,
  duration_minutes integer,

  -- ★ in the grouping doc: this training is a real artifact getting built rather
  -- than pure theory, so it doubles as the menu of likely live builds (§6).
  is_hot_seat_buildable boolean not null default false,

  -- The small universal starter set, plus the hand-picked trailer replays, that
  -- onboarding members can see before any diagnosis exists (§1, §6).
  available_during_onboarding boolean not null default false,

  -- Null = not visible to members yet. Admin uploads, then publishes.
  published_at timestamptz,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_content_station_idx
  on public.training_content (station_slug, sort_order);

create index training_content_kind_idx on public.training_content (kind);

-- The recommendation engine's lookup: bucket + job for a member's current focus.
create index training_content_bucket_job_idx
  on public.training_content (bucket, job)
  where published_at is not null;

create trigger training_content_set_updated_at
  before update on public.training_content
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- The two-tier access rule from §1/§6, expressed once here rather than in every
-- query: onboarding members see the starter set and trailer replays; the full
-- library unlocks at active.
-- ---------------------------------------------------------------------------

alter table public.training_content enable row level security;

create policy training_content_select_member
  on public.training_content for select
  to authenticated
  using (
    public.has_portal_access()
    and published_at is not null
    and (public.is_active_member() or available_during_onboarding)
  );

create policy training_content_all_admin
  on public.training_content for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- Export rules (§11) — enforced in the app, not here
-- ---------------------------------------------------------------------------
--
-- SOPs are the ONLY exportable content in the whole product. Formal training
-- content is non-exportable: video streams with no download link exposed, PDFs in
-- an embedded viewer with no download button, audio streams rather than downloads.
--
-- This is standard "soft" protection, the same approach as Kajabi or Teachable —
-- not airtight against a screen recording, and deliberately not over-engineered
-- to be. What that means in practice for `asset_path`: serve it through short-
-- lived signed URLs from a PRIVATE storage bucket, and never render the raw path
-- into the page. A public bucket would make the whole rule cosmetic.
