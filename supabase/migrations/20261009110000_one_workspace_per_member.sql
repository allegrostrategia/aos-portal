-- =============================================================================
-- One reporting workspace per member. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Nina's decision 30: a member's reporting workspace is created with the
-- member, so nobody can arrive at "no access". That is safe only once a
-- second one is impossible.
--
-- **Why it is not safe without this.** Rule 7 says a rejoining member is
-- the SAME row going through onboarding again — never a new record, never
-- an instant reactivation. So whatever creates the workspace will run a
-- second time for somebody who already has one, and today nothing stops
-- it: `report_workspaces` has no unique constraint of any kind beyond its
-- primary key. The result would not be an error. It would be two
-- workspaces for one person, their history split in half, and the halves
-- only findable by knowing which id to ask for.
--
-- **Checked on live before writing this, 9 October:**
--   · 1 workspace in total — "Test Client", a retainer, owned by a login
--     with no `members` row, which is right: retainer clients are not
--     members.
--   · 0 workspaces of kind `aos_member`.
--   · 5 active members, none of whom owns one.
--   So there is nothing to clean up first, and the index cannot fail on
--   existing rows. The backfill that gives those five a workspace comes
--   with the creation mechanism, not here — this is the net, and the net
--   goes up first.
--
-- **`aos_member` only, as a partial index.** Not a constraint on the whole
-- table, for two reasons:
--   · A retainer workspace's owner is the client's login, and nothing says
--     one business owner cannot have two retainer workspaces — two brands
--     under one login is a real thing and not ours to refuse.
--   · Chiarezza is explicitly repeatable: somebody attends, their access
--     ends, they attend again. That is a second workspace with a second
--     end date, and it is correct.
-- A member reporting on themselves is the one case where two is always
-- wrong, so it is the one case the database refuses.

create unique index report_workspaces_one_per_member
  on public.report_workspaces (owner_user_id)
  where kind = 'aos_member';

comment on index public.report_workspaces_one_per_member is
  'A member has one reporting workspace, so rejoining (rule 7: same row, full onboarding again) cannot quietly make a second and split their history. Partial: retainer and Chiarezza workspaces are repeatable by design (Dom, 9 Oct 2026).';
