-- =============================================================================
-- A published month keeps the figures it was published with. NOT APPROVED.
-- =============================================================================
--
-- `docs/freeze-plan.md`, decisions 1, 2 and 3, approved by Dom on
-- 7 October 2026.
--
-- A retainer client's figures are computed from the months THEY can read,
-- and they can only read published ones. So taking July back to draft
-- emptied part of a client's published August while they still had it open:
-- active clients at start, retention and churn all vanished, and active
-- clients at end came out as 3 where it had read 25. The strict
-- `activeClientsAtEnd` fixed the wrong number; this fixes the rest, by not
-- deriving anything at read time on a month that has gone out.
--
-- DECISION 1: one column, not a table.
--   It is written once and read once, always whole, and never queried
--   across months. A `report_carried_values` table would be several hundred
--   rows a year answering no question anybody asks, with its own RLS and
--   its own guard. The cost of jsonb is that the shape is unvalidated, which
--   `readCarried` answers by degrading to the live walk rather than throwing
--   on a page a client is reading.
--
-- DECISION 2: targets, benchmarks and the entity settings go in it.
--   The panel says "New clients is at 40% of your target" in the client's
--   own report — that is a sentence in the report, and it should not change
--   after it is sent. It also closes the two holes the 7 October lock could
--   not reach, both for the same reason: a STANDING target and a benchmark
--   belong to no month, so no month-keyed guard can hold them still. The
--   entity settings are the third: a campaign's goal decides whose spend
--   counts towards cost per lead (§10.2, £4.50 honest against £6.00
--   blended), and an offer's name is the row label the client reads.
--
-- DECISION 3: on a published month, everybody reads the snapshot.
--   Nina and the client see the same report, which is §9's rule. The live
--   view she wants while correcting is the draft view, which she gets by
--   unpublishing — the route the lock already made the only one.

alter table public.report_periods
  add column carried jsonb not null default '{}'::jsonb;

comment on column public.report_periods.carried is
  'What this month was published with: the opening-figure chain resolved, the previous month''s figures, the targets, benchmarks and entity settings it was drawn against. Written by publishMonth with the service role; read in preference to the live walk once published. `{}` means nothing was frozen (Dom, 7 Oct 2026).';

-- -----------------------------------------------------------------------------
-- `carried` is the system's column, like the email ones before it
-- -----------------------------------------------------------------------------
-- Dom, 7 October: add it to the protected list explicitly, on insert and
-- update, the way `email_sent_at`, `email_error` and `email_to` were on the
-- 5th. Without it the guard is silent about the column and
-- `report_periods_update_editors` admits the row, so an editor could write
-- their own snapshot onto a published month — the column-ownership trap, on
-- the very column added to close a gap.
--
-- The whole function is re-stated rather than patched, because that is how
-- `create or replace` works and because a reader should be able to see the
-- complete list of protected columns in one place. Only the two `carried`
-- clauses are new; everything else is the 5 October version unchanged.
create or replace function public.guard_report_period_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The service role (no JWT, so auth.uid() is null) sends the publication
  -- email, writes its outcome, and now writes the snapshot. Admitting it is
  -- the fix this codebase has already had to make twice.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  -- On insert there is no old row to compare against: a team member creating
  -- a period that arrives already published would otherwise walk straight
  -- past the update branch.
  if tg_op = 'INSERT' then
    if new.published_at is not null or new.published_by is not null
       or new.email_sent_at is not null or new.email_error is not null
       or new.email_to is not null
       or new.carried <> '{}'::jsonb then
      raise exception 'Only an admin can publish a report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.email_sent_at is distinct from old.email_sent_at
     or new.email_error is distinct from old.email_error
     or new.email_to is distinct from old.email_to
     or new.carried is distinct from old.carried
  then
    raise exception 'Only an admin can publish a report';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_period_publish() is
  'Elize drafts, Nina publishes (30 Sep 2026). Holds back the publish columns, the email columns (5 Oct) and the carried snapshot (7 Oct), which RLS cannot: a row policy grants every column of the row.';
