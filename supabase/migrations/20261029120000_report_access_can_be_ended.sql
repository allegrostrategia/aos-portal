-- aOS Reporting Tool — ending a client's access, without losing the record of
-- having done it.
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
-- WHY A COLUMN AND NOT AN AUDIT TABLE. The grant row IS the record. Marking it
-- revoked keeps who, when and on what in one place that already has a unique
-- key on (workspace_id, user_id), and it means `report_can_view()` needs one
-- more condition rather than a join to somewhere else. The team-grant delete
-- stays as it is — the comment on `unassign_report_team_member` is right that a
-- team assignment is permission and not a record of anything. A paying client
-- losing access is a different kind of event.
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

-- =============================================================================
-- Ending it
-- =============================================================================

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

  return v_access;
end;
$$;

comment on function public.end_report_client_access(uuid, uuid) is
  'Revoke a retainer client login''s access to a workspace. Keeps the grant row as the record of it, and every report and figure untouched.';

revoke all on function public.end_report_client_access(uuid, uuid) from public;
grant execute on function public.end_report_client_access(uuid, uuid) to authenticated;
