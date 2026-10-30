-- aOS Reporting Tool — ending a client's access, and giving it back, without
-- losing the record of either.
--
-- Dom, 29 October 2026, from the pre-launch account audit. There was no way to
-- stop a reporting login at all, and every door was shut for a different
-- reason:
--
--   · `cancel_member()` raises "No member with id" — a retainer client has no
--     `members` row, by design (Nina, 30 September).
--   · `access_end_date` is refused by `report_workspaces_only_chiarezza_expires`.
--   · `unassign_report_team_member()` deletes `role = 'team'` rows only, never
--     the client grant.
--   · the admin screen offers invite, assign and save-details, and nothing else.
--
-- So the only ways to end a retainer client's access were to delete their
-- `report_access` row by hand or disable the auth user in the Supabase
-- dashboard. The first destroys the only evidence it happened; the second is
-- invisible from inside aOS. Both are the wrong shape for a product whose first
-- standing rule is that nothing is ever deleted.
--
-- A COLUMN **AND** AN EVENT LOG, and they do different jobs. `revoked_at` on
-- the grant is the live flag: it is what every policy reads, it needs no join,
-- and the row already has a unique key on (workspace_id, user_id). But the flag
-- cannot be the record, because restoring access clears it — and rule 7 says
-- nothing is ever deleted. So `report_access_events` keeps one row per ending
-- and one per restoring, and a client who leaves and comes back twice has four
-- rows rather than one overwritten pair.
--
-- The team-grant delete stays as it is — the comment on
-- `unassign_report_team_member` is right that a team assignment is permission
-- and not a record of anything. A paying client losing access is a different
-- kind of event.
--
-- NOT A CANCELLATION. This revokes one login's access to one workspace. The
-- workspace, every month, every figure, every note and every reply stay exactly
-- where they are and stay readable to Nina — `report_workspaces_all_admin` and
-- its siblings admit `is_portal_admin()` outright and are untouched here.

alter table public.report_access
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users (id) on delete set null;

comment on column public.report_access.revoked_at is
  'When this grant was ended. The row stays so the event is on the record; nothing reads it as access once this is set.';
comment on column public.report_access.revoked_by is
  'The admin who ended it. Null if that account is later removed — the timestamp is the part that must survive.';

-- "Who has access right now", which is what every policy asks and what the
-- admin screen counts.
create index if not exists report_access_live_idx
  on public.report_access (workspace_id, role)
  where revoked_at is null;

-- =============================================================================
-- The record of every ending and every restoring
-- =============================================================================

create table if not exists public.report_access_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  action text not null check (action in ('ended', 'restored')),

  -- Who did it, twice over. The id for joining, the name as it stood at the
  -- time — the same pair, for the same reason, as `report_notes.author_name`:
  -- the id is `on delete set null`, so without the name a removed admin takes
  -- the answer with them, and "who ended this client's access" is exactly the
  -- question this table exists to answer years later.
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,

  created_at timestamptz not null default now()
);

create index if not exists report_access_events_grant_idx
  on public.report_access_events (workspace_id, user_id, created_at desc);

alter table public.report_access_events enable row level security;

-- Nina's record, not the client's. There is nothing here a client needs that
-- `/no-access` does not already tell them, and a list of the times they were
-- cut off is not something to hand back to them.
create policy report_access_events_all_admin on public.report_access_events
  for all using (public.is_portal_admin()) with check (public.is_portal_admin());

comment on table public.report_access_events is
  'One row each time a retainer client''s access is ended or restored. The grant''s revoked_at is the live flag; this is the history, which survives being restored.';

-- =============================================================================
-- The two helpers every reporting policy is written in terms of
--
-- Restated in full rather than patched, because that is the only honest way to
-- show the diff: the one added line is `and ra.revoked_at is null`, at the top
-- level of both, so it applies whatever the grant's role or the workspace's
-- kind. Everything else below is character-for-character what
-- `pg_get_functiondef` returned from live on 29 October before this ran.
-- =============================================================================

create or replace function public.report_can_view(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_access ra
    join public.report_workspaces w on w.id = ra.workspace_id
    where ra.workspace_id = p_workspace_id
      and ra.user_id = (select auth.uid())
      -- Ended access, for any role and any kind. A revoked grant is kept as
      -- the record of a client who used to be here, never read as permission.
      and ra.revoked_at is null
      and (
        ra.role = 'team'
        or w.access_end_date is null
        or w.access_end_date >= current_date
      )
      -- Rule 7: cancelling revokes access and keeps every record. For an aOS
      -- member the reporting tool is one more area of a membership, so it
      -- goes when the membership does — their figures stay, exactly as their
      -- log and roadmap do. A retainer or Chiarezza login has no members row
      -- and no membership to lose, and a team assignment is Allegro's, so
      -- neither is subject to this.
      and (
        ra.role = 'team'
        or w.kind <> 'aos_member'
        or public.has_portal_access()
      )
  );
$$;

comment on function public.report_can_view(uuid) is
  'Access to a reporting workspace, with Chiarezza expiry and ended grants applied. A team assignment does not expire with the client''s window.';

create or replace function public.report_can_edit(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_access ra
    join public.report_workspaces w on w.id = ra.workspace_id
    where ra.workspace_id = p_workspace_id
      and ra.user_id = (select auth.uid())
      and ra.revoked_at is null
      and (
        ra.role = 'team'
        or (ra.role = 'client' and w.kind <> 'retainer')
      )
      and (
        ra.role = 'team'
        or w.access_end_date is null
        or w.access_end_date >= current_date
      )
      and (
        ra.role = 'team'
        or w.kind <> 'aos_member'
        or public.has_portal_access()
      )
  );
$$;

comment on function public.report_can_edit(uuid) is
  'Write access to a workspace''s figures. False for a retainer client by design (§2), and false for an ended grant.';

-- The third helper, which `report_notes_write` is written in terms of.
--
-- Nothing can revoke a team grant through the product — `end_report_client_access`
-- below refuses one, and `unassign_report_team_member()` deletes it instead. So
-- this line is unreachable today, and that is exactly why it is here: the
-- invariant is "a revoked row is not permission", not "a revoked CLIENT row is
-- not permission". The same gap in `report_can_edit` looked covered by a test
-- that could not fail, and was found only by mutating the line away.
create or replace function public.report_is_team(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.report_access
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role = 'team'
      and revoked_at is null
  );
$$;

comment on function public.report_is_team(uuid) is
  'Whether the caller holds a live team assignment on this workspace. A revoked row is not one.';

-- =============================================================================
-- Ending it, and giving it back
-- =============================================================================

-- The acting admin's name, as it stands right now.
--
-- Always an admin: both callers refuse anyone `is_portal_admin()` says no to
-- before they reach this. The fallback is for the service role, which has no
-- JWT and therefore no row to read — it cannot reach either function today,
-- but a null here would violate the NOT NULL and lose the event entirely,
-- which is the worse failure of the two.
create or replace function public.report_access_actor_name()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(m.full_name), '')
       from public.members m
      where m.id = (select auth.uid())),
    'An administrator'
  );
$$;

revoke all on function public.report_access_actor_name() from public;

create or replace function public.end_report_client_access(
  p_workspace_id uuid,
  p_user_id uuid
)
returns public.report_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.report_access;
  v_kind public.report_workspace_kind;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can end a client''s access';
  end if;

  select kind into v_kind
  from public.report_workspaces
  where id = p_workspace_id;

  if v_kind is null then
    raise exception 'No workspace with id %', p_workspace_id;
  end if;

  -- **Retainer only, and the refusals name the right route instead.** The
  -- other two kinds already have one, and offering a third would leave two
  -- ways to stop the same login that behave differently:
  --
  --   · aos_member — the reporting tool is one area of a membership.
  --     `cancel_member()` takes it with everything else, which is rule 7 and
  --     is already what report_can_view() applies.
  --   · chiarezza — access runs to a date set when they were invited, and
  --     `access_end_date` is where that lives.
  if v_kind <> 'retainer' then
    raise exception
      'Access to a % workspace is not ended here: %',
      v_kind,
      case v_kind
        when 'aos_member' then 'cancel the membership and the reporting goes with it'
        else 'set the access end date on the workspace'
      end;
  end if;

  select * into v_access
  from public.report_access
  where workspace_id = p_workspace_id
    and user_id = p_user_id;

  if v_access.id is null then
    raise exception 'That login has no grant on this workspace';
  end if;

  -- A team assignment is removed, not ended: `unassign_report_team_member()`
  -- deletes it, and nothing of theirs is attached to the row (report_notes
  -- stores the author's name alongside the id for this reason).
  if v_access.role <> 'client' then
    raise exception 'That is a team assignment. Remove it instead of ending it';
  end if;

  if v_access.revoked_at is not null then
    raise exception 'That access was already ended on %', v_access.revoked_at::date;
  end if;

  update public.report_access
  set revoked_at = now(),
      revoked_by = (select auth.uid())
  where id = v_access.id
  returning * into v_access;

  insert into public.report_access_events
    (workspace_id, user_id, action, actor_id, actor_name)
  values
    (p_workspace_id, p_user_id, 'ended', (select auth.uid()),
     public.report_access_actor_name());

  return v_access;
end;
$$;

comment on function public.end_report_client_access(uuid, uuid) is
  'Revoke a retainer client login''s access to a workspace. Keeps the grant row as the record of it, and every report and figure untouched.';

revoke all on function public.end_report_client_access(uuid, uuid) from public;
grant execute on function public.end_report_client_access(uuid, uuid) to authenticated;

-- Giving it back.
--
-- **Why this exists at all, rather than re-inviting them.** `report_access`
-- is unique on (workspace_id, user_id), so while the revoked row is there no
-- new grant for that person on that workspace can be inserted — and the two
-- routes that might have served instead do not:
--
--   · `inviteReportClient` makes a NEW auth user and a NEW workspace, and
--     already refuses an address that has an account. Even if it did not, it
--     would hand them an empty second workspace and leave every month they
--     have behind — the one thing ending access was built not to do.
--   · `assign_report_team_member` refuses any workspace where the login holds
--     a client grant, revoked or not, so it cannot be used as a back door.
--
-- Restoring the row they already have is therefore not the tidier option. It
-- is the only way back that keeps their history.
create or replace function public.restore_report_client_access(
  p_workspace_id uuid,
  p_user_id uuid
)
returns public.report_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.report_access;
  v_kind public.report_workspace_kind;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can restore a client''s access';
  end if;

  select kind into v_kind
  from public.report_workspaces
  where id = p_workspace_id;

  if v_kind is null then
    raise exception 'No workspace with id %', p_workspace_id;
  end if;

  -- The mirror of the refusals above: only the kind that can be ended here
  -- can be restored here, so there is exactly one route in each direction.
  if v_kind <> 'retainer' then
    raise exception
      'Access to a % workspace is not restored here: %',
      v_kind,
      case v_kind
        when 'aos_member' then 'reinstate the membership and the reporting comes with it'
        else 'set the access end date on the workspace'
      end;
  end if;

  select * into v_access
  from public.report_access
  where workspace_id = p_workspace_id
    and user_id = p_user_id;

  if v_access.id is null then
    raise exception 'That login has no grant on this workspace';
  end if;

  if v_access.role <> 'client' then
    raise exception 'That is a team assignment, which is not ended or restored here';
  end if;

  if v_access.revoked_at is null then
    raise exception 'That access has not been ended, so there is nothing to restore';
  end if;

  update public.report_access
  set revoked_at = null,
      revoked_by = null
  where id = v_access.id
  returning * into v_access;

  -- The flag is cleared, so this row is now the only thing that remembers it
  -- ever happened. Written in the same statement sequence as the clearing,
  -- inside the function, so there is no path that does one without the other.
  insert into public.report_access_events
    (workspace_id, user_id, action, actor_id, actor_name)
  values
    (p_workspace_id, p_user_id, 'restored', (select auth.uid()),
     public.report_access_actor_name());

  return v_access;
end;
$$;

comment on function public.restore_report_client_access(uuid, uuid) is
  'Give an ended retainer client login its access back, on the same grant row, so every month it already had comes back with it.';

revoke all on function public.restore_report_client_access(uuid, uuid) from public;
grant execute on function public.restore_report_client_access(uuid, uuid) to authenticated;
