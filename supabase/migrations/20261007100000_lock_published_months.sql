-- =============================================================================
-- A published month stops changing.
-- =============================================================================
--
-- Dom's decision, 7 October 2026, after the 6 October finding that nothing
-- held a published month still: every write policy on the month-keyed tables
-- asked `report_can_edit(workspace_id)` and no more, so a figure in a report
-- a client had already read could change under them, silently.
--
-- From here, corrections go **unpublish → fix → republish**, and republishing
-- sends the "has been updated" email the client is owed. The route is the
-- product, not a side effect: the screens go read-only and say so.
--
-- WHAT IS LOCKED
--   report_values, report_top_items, report_notes — insert, update AND delete.
--   All three verbs, because a lock on two of them leaks through the third:
--   proved on 6 October, where a publish guard on insert/update left clearing
--   a top-three line still working, a delete being its own trigger event.
--
-- WHAT IS NOT, AND WHY IT MUST NOT BE
--   · A client's reply (`note_type = 'client_reply'`). Publishing is what
--     CREATES the ability to reply — the box does not exist before it — so a
--     blanket lock on report_notes would delete §8's conversation outright.
--     Their own reply stays editable too; `guard_report_note_update` already
--     pins which note it is and who wrote it, so a reply cannot be edited
--     into a strategist's note.
--   · Anything on a workspace that is not a retainer. See below.
--   · report_periods' own columns, which are how a month gets unpublished and
--     how the email records its outcome. Already guarded, separately.
--
-- SELF-SERVE IS UNTOUCHED, ON PURPOSE
--   Publishing is a retainer concept. `report_is_visible` already says so —
--   "Self-serve: always. They typed it; there is nobody to wait for" — and
--   the publish control renders only for `kind = 'retainer'`. A self-serve
--   client is also their own editor (`report_can_edit` is true for them),
--   so an unscoped lock would be a trap: one `published_at` set on an
--   aos_member's period and they are shut out of their own figures, with an
--   unpublish button that is admin-only and that they will never see. The
--   `w.kind = 'retainer'` test below is what stops that being possible.
--
-- ADMIN AND SERVICE ROLE PASS
--   As every guard in this codebase does. The service role has no JWT, so
--   `auth.uid()` is null and `is_portal_admin()` is false — the mistake that
--   has already cost this project the day-7 pairing flag and a week of
--   `accrue_hours_for_week`. The publish email writes with it.
--
--   So the lock binds Elize absolutely and Nina by convention: her screens go
--   read-only with everyone else's, and the database is the escape hatch
--   rather than the fence. That is deliberate — the person who can unpublish
--   does not need to be stopped, she needs to be told.

-- -----------------------------------------------------------------------------
-- Is this month closed to edits?
-- -----------------------------------------------------------------------------
-- Defined ONCE and used by every trigger below, for the reason the comment on
-- `report_is_visible` gives: the version of that function copied into four
-- policies came out different in four places.
create or replace function public.report_month_is_locked(p_workspace_id uuid, p_month date)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.report_periods p
      join public.report_workspaces w on w.id = p.workspace_id
     where p.workspace_id = p_workspace_id
       and p.month = p_month
       and p.published_at is not null
       -- Retainer only. A self-serve month has no "published" to speak of.
       and w.kind = 'retainer'
  );
$$;

comment on function public.report_month_is_locked(uuid, date) is
  'Whether a month is closed to edits: published, and on a retainer workspace. Corrections go unpublish -> fix -> republish (Dom, 7 Oct 2026).';

-- -----------------------------------------------------------------------------
-- The guard
-- -----------------------------------------------------------------------------
create or replace function public.guard_report_published_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_month date;
  v_old_workspace uuid;
  v_old_month date;
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- §8's reply is the one write publishing makes possible rather than
  -- impossible. Insert and update only: a reply, once sent, is never deleted,
  -- and there is no delete policy that would let one through here anyway.
  --
  -- An update is judged on what the row IS, not what it is becoming. That
  -- matters because of trigger order: `report_notes_guard_published` sorts
  -- before `report_notes_guard_update`, so a client trying to turn their
  -- reply into a note from their strategist would otherwise be told the
  -- month is published — true, and not the answer to what they did. Let the
  -- row through and the older guard, whose whole subject is which columns
  -- may change, gives the reason: "what it is and who wrote it cannot".
  if tg_table_name = 'report_notes' then
    if (tg_op = 'INSERT' and new.note_type = 'client_reply')
       or (tg_op = 'UPDATE' and old.note_type = 'client_reply')
    then
      return new;
    end if;
  end if;

  -- DELETE has no NEW row; everything else is judged on the row as it will be.
  if tg_op = 'DELETE' then
    v_workspace := old.workspace_id;
    v_month := old.month;
  else
    v_workspace := new.workspace_id;
    v_month := new.month;
  end if;

  if public.report_month_is_locked(v_workspace, v_month) then
    raise exception 'That month is published. Unpublish it to make changes.'
      using errcode = 'check_violation';
  end if;

  -- An update that MOVES a row has two months to answer for. Without this,
  -- dragging a figure out of a published August into a draft September would
  -- pass the check above and still change what the client was sent. The
  -- column-ownership trap in its other shape: the policy admits the row, so
  -- every column of it is in play, the key columns included.
  if tg_op = 'UPDATE' then
    v_old_workspace := old.workspace_id;
    v_old_month := old.month;
    if (v_old_workspace, v_old_month) is distinct from (v_workspace, v_month)
       and public.report_month_is_locked(v_old_workspace, v_old_month)
    then
      raise exception 'That month is published. Unpublish it to make changes.'
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.guard_report_published_month() is
  'Refuses writes to a published retainer month. Admin and the service role pass; a client reply does not count as a change to the report.';

create trigger report_values_guard_published
  before insert or update or delete on public.report_values
  for each row
  execute function public.guard_report_published_month();

create trigger report_top_items_guard_published
  before insert or update or delete on public.report_top_items
  for each row
  execute function public.guard_report_published_month();

create trigger report_notes_guard_published
  before insert or update or delete on public.report_notes
  for each row
  execute function public.guard_report_published_month();

-- -----------------------------------------------------------------------------
-- The top-items delete policy, which waited for this
-- -----------------------------------------------------------------------------
-- Written on 6 October and deliberately held: approving it on its own would
-- have widened the hole by one verb, since clearing a line on a published
-- month was the exact thing nothing stopped. It ships here, with the guard
-- that makes it safe, so the two can never be apart.
--
-- Without it, an editor emptying a top-three line is refused in silence —
-- a delete matching no row under RLS is not an error — which is why
-- `saveTopItems` reads back what went rather than trusting the call.
create policy report_top_items_delete_editors
  on public.report_top_items for delete
  to authenticated
  using (public.report_can_edit(workspace_id));

comment on policy report_top_items_delete_editors on public.report_top_items is
  'An emptied line is removed, not stored blank. Bounded by the published-month guard, which refuses the delete on a month the client has already read.';
