-- aOS — reference data: buckets, stations, time-tracking categories.
--
-- Build Brief §4 (Time tracking categories), §6 (Structure), §11 (Stations).
--
-- These are fixed vocabulary, not member data — seeded here rather than managed
-- in admin, because changing them changes the diagnostic itself. They're the
-- shared language the weekly log, the library and the recommendation engine all
-- speak, so they live in one place.

-- ---------------------------------------------------------------------------
-- The V/L/S/P buckets
--
-- Secondary tags only. Every training lives in exactly one STATION — the bucket
-- feeds the recommendation engine, it is not the browsing structure (§6).
-- ---------------------------------------------------------------------------

create type public.bucket as enum (
  'visibility',
  'launch',
  'systems_delivery',
  'profit'
);

-- ---------------------------------------------------------------------------
-- Stations
--
-- The eleven places on La Strada. Deliberately no bucket column: the brief maps
-- individual trainings to buckets, not stations, and inventing a station→bucket
-- lookup would quietly become a second taxonomy competing with the real one.
-- ---------------------------------------------------------------------------

create table public.stations (
  slug text primary key,
  name text not null,
  -- What the station is for, in the member's language. Display copy.
  description text,
  -- Grand Hotel Riposo, Archivio and Piazza Sociale hold no formal training
  -- content (Training_Library_Grouping.md) — onboarding, the member's own
  -- project archive, and chat/directory respectively.
  holds_training_content boolean not null default true,
  -- Order along the map.
  sort_order smallint not null,
  created_at timestamptz not null default now()
);

insert into public.stations (slug, name, description, holds_training_content, sort_order) values
  ('grand-hotel-riposo',   'Grand Hotel Riposo',   'Onboarding and the audit — where every member arrives', false,  1),
  ('studio-dell-architetto','Studio dell''Architetto','Systems & Delivery — process and blueprint content',  true,   2),
  ('officina-vespa',       'Officina Vespa',       'Automation — tools, tech setup, evergreen systems',      true,   3),
  ('cinema-allegro',       'Cinema Allegro',       'Visibility — plus hot seat replays and Nina''s weekly audio drop', true, 4),
  ('piazza-caffe',         'Piazza Caffè',         'Leads & Nurture',                                        true,   5),
  ('la-boutique',          'La Boutique',          'Offers & Pricing',                                       true,   6),
  ('banco-allegro',        'Banco Allegro',        'Data & Money',                                           true,   7),
  ('stazione-centrale',    'Stazione Centrale',    'Launches',                                               true,   8),
  ('terrazza',             'Terrazza',             'In-Person & Events',                                     true,   9),
  ('club-allegro',         'Club Allegro',         'Membership Design',                                      true,  10),
  ('archivio',             'Archivio',             'The member''s own project archive — the handover pack',  false, 11);

-- ---------------------------------------------------------------------------
-- Time-tracking categories (§4)
--
-- The fixed ten. Seeded exactly as the brief's table specifies, including the
-- two delivery categories that map to no station.
-- ---------------------------------------------------------------------------

create table public.time_categories (
  slug text primary key,
  label text not null,
  bucket public.bucket not null,

  -- Null for the two delivery categories. Per §4 the pricing/leverage flag is
  -- itself the routing (it points at La Boutique), so there is no category→station
  -- lookup to fall back on — hence nullable rather than a fake "delivery" station.
  station_slug text references public.stations (slug),

  -- True for Client Sessions and Group Client Sessions only. These are NOT
  -- excluded from the diagnostic, but they don't use the simple "too many hours"
  -- threshold the other categories use, because high delivery hours can be
  -- perfectly healthy. They get a relational check instead: delivery hours
  -- measured against pricing/revenue from the member's audit snapshot. High hours
  -- + low revenue-per-hour raises a pricing/leverage flag pointing at Profit-bucket
  -- work; high hours with healthy numbers behind them stays unflagged (§4).
  uses_relational_check boolean not null default false,

  sort_order smallint not null,
  created_at timestamptz not null default now()
);

insert into public.time_categories (slug, label, bucket, station_slug, uses_relational_check, sort_order) values
  ('client-sessions',       'Client Sessions',        'systems_delivery', null,                      true,   1),
  ('group-client-sessions', 'Group Client Sessions',  'systems_delivery', null,                      true,   2),
  ('finance-admin',         'Finance admin',          'profit',           'banco-allegro',           false,  3),
  ('course-client-admin',   'Course / Client Admin',  'systems_delivery', 'studio-dell-architetto',  false,  4),
  ('strategy-new-offers',   'Strategy / New offers',  'profit',           'la-boutique',             false,  5),
  ('looking-at-data',       'Looking at data',        'profit',           'banco-allegro',           false,  6),
  ('sales-calls',           'Sales calls',            'profit',           'piazza-caffe',            false,  7),
  ('ads-marketing',         'Ads / Marketing',        'visibility',       'cinema-allegro',          false,  8),
  ('social-media',          'Social Media',           'visibility',       'cinema-allegro',          false,  9),
  ('other-admin-tasks',     'Other Admin Tasks',      'systems_delivery', 'studio-dell-architetto',  false, 10);

-- ---------------------------------------------------------------------------
-- Access helper
--
-- Companion to has_portal_access(). Several tables need the sharper distinction
-- between "can reach the portal at all" and "has finished onboarding" — the full
-- library and free-roam La Strada unlock at active, the starter set doesn't (§1, §6).
-- ---------------------------------------------------------------------------

create or replace function public.is_active_member()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select status = 'active' from public.members where id = (select auth.uid())),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Reference data, not member content, so standing rule 6's has_portal_access()
-- gate doesn't apply: knowing the ten category names reveals nothing personal,
-- and the timer UI needs them before anything else loads. Writes are admin-only.
-- ---------------------------------------------------------------------------

alter table public.stations enable row level security;
alter table public.time_categories enable row level security;

create policy stations_select_all
  on public.stations for select
  to authenticated
  using (true);

create policy stations_write_admin
  on public.stations for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy time_categories_select_all
  on public.time_categories for select
  to authenticated
  using (true);

create policy time_categories_write_admin
  on public.time_categories for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
