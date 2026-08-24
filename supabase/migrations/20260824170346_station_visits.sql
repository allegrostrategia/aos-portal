-- aOS — which stations a member has walked into.
--
-- Build Brief §3: "after onboarding, La Strada is the full map, navigated
-- entirely by the member's own choice — not routed by 'current focus'. This
-- simplifies the map's logic considerably: just visited / not visited, no
-- complex current-phase routing needed."
--
-- So this table is deliberately the whole of the map's state. Not progress, not
-- completion, not a score — whether they have been in the room. Anything richer
-- would be a claim the product cannot actually support, since nothing measures
-- what someone took from a visit.

create table public.station_visits (
  member_id uuid not null references public.members (id) on delete cascade,
  station_slug text not null references public.stations (slug) on delete cascade,

  -- The first time they walked in. Kept rather than overwritten, because "when
  -- did you first find this room" is the interesting question; a last-seen
  -- timestamp would answer a question nobody has asked.
  first_visited_at timestamptz not null default now(),
  visit_count integer not null default 1,
  last_visited_at timestamptz not null default now(),

  primary key (member_id, station_slug)
);

create index station_visits_member_idx on public.station_visits (member_id);

-- ---------------------------------------------------------------------------
-- Recording a visit
--
-- A function rather than an upsert from the app: the increment and the
-- first-visit preservation belong together, and doing it in one statement means
-- two page loads racing can't lose a count or reset the first visit.
-- ---------------------------------------------------------------------------

create or replace function public.record_station_visit(p_station_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cancelled members reach nothing, so a visit from one would be a bug
  -- elsewhere; refusing quietly rather than raising keeps a page render from
  -- failing over something this incidental.
  if not public.has_portal_access() then
    return;
  end if;

  insert into public.station_visits (member_id, station_slug)
  values ((select auth.uid()), p_station_slug)
  on conflict (member_id, station_slug) do update
    set visit_count = public.station_visits.visit_count + 1,
        last_visited_at = now();
end;
$$;

revoke all on function public.record_station_visit(text) from public;
grant execute on function public.record_station_visit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.station_visits enable row level security;

create policy station_visits_select_own
  on public.station_visits for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- No insert or update policy: visits are recorded through
-- record_station_visit(), so a member cannot fabricate a history of rooms they
-- never entered.

create policy station_visits_all_admin
  on public.station_visits for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
