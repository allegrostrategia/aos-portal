-- aOS Reporting — a launch stays editable while it is still running.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying.
--
-- Nina updates a launch daily while it runs; decision 18 locked a
-- published launch to everything but its status. Both are right, and the
-- thing that reconciles them is that a published launch is not finished
-- — it is a scoreboard during the launch and a report after it.
--
-- WHAT CHANGES
--   `report_launch_is_locked()` gains a third condition: the launch's
--   dates have passed. Today (UK, not UTC - a launch ending "the 12th"
--   ends at the end of the 12th in Nina's day, and in BST those are not
--   the same instant for the first hour) must be past the last date any
--   of its stages carries.
--
--   **A launch with no dates on any stage locks on publish, exactly as
--   now.** Deliberate, and the safe way round: no dates means nothing
--   says when it stops, and a report that silently never locks is worse
--   than one that locks early. Unpublish, fix, republish still works, so
--   nothing is trapped.
--
-- WHY THE GUARD HAS TO MOVE TOO, AND NOT JUST THE SCREEN
--   Every launch guard already passes `is_portal_admin()`, so Nina has
--   never been refused by the database - her screens go read-only with
--   everyone else's, because the lock is a route rather than a
--   permission. Elize is refused by the database. Leaving the guard
--   alone would mean Nina doing daily data entry while the person whose
--   job it is watches, so the rule moves where both halves read it.
--
-- WHAT DOES NOT CHANGE
--   Publishing is still Nina's alone. The lock still applies to retainer
--   workspaces only. A finished launch is as locked as it ever was, and
--   corrections to one still go unpublish -> fix -> republish. The
--   snapshot (`carried`) is untouched: it holds the linked offer's name,
--   which is a label, and nothing about this makes a label change safer
--   or less safe.

-- -----------------------------------------------------------------------------
-- The last day this launch is running
-- -----------------------------------------------------------------------------
create or replace function public.report_launch_last_day(p_launch_id uuid)
returns date
language sql
security definer
stable
set search_path = ''
as $$
  -- The latest date anything about this launch is scheduled for. Promo
  -- and live windows both count and a stage may carry either, so it is
  -- the greatest of all four columns across every stage. `greatest()`
  -- ignores nulls and `max()` ignores them across rows, so a half-filled
  -- stage needs no special case; null comes back only when no stage
  -- carries a date at all, which every caller treats as finished.
  select max(greatest(s.promo_start, s.promo_end, s.live_start, s.live_end))
    from public.report_launch_stages s
   where s.launch_id = p_launch_id;
$$;

comment on function public.report_launch_last_day(uuid) is
  'The last date any stage of this launch is scheduled for, or null if no stage has a date. Null means finished, which is what locks a dateless launch on publish (Nina, 3 Nov 2026).';

-- -----------------------------------------------------------------------------
-- Locked, now that "published" and "finished" are different things
-- -----------------------------------------------------------------------------
create or replace function public.report_launch_is_locked(p_launch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.report_launches l
      join public.report_workspaces w on w.id = l.workspace_id
     where l.id = p_launch_id
       and l.published_at is not null
       and w.kind = 'retainer'
       -- Still running, so still editable. `last_day` null is a launch
       -- with no dates, and `>= today` is inclusive: the last day of a
       -- launch is a day Nina is still typing into it.
       and coalesce(
             public.report_launch_last_day(l.id)
               < (now() at time zone 'Europe/London')::date,
             true
           )
  );
$$;

comment on function public.report_launch_is_locked(uuid) is
  'Whether a launch is closed to edits: published, on a retainer workspace, and past its last stage date. A launch with no stage dates counts as past (Nina, 3 Nov 2026 - it was published-and-retainer alone until then).';
