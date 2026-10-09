-- =============================================================================
-- Nina can actually put a cover on. NOT APPROVED — do not apply.
-- =============================================================================
--
-- `20261008100002_launch_cover_bucket.sql` gave the bucket four policies,
-- all of them built on `report_can_edit` and `report_can_read_launch`.
-- Both of those answer the same question: **is there a `report_access`
-- row for this login on this workspace.** An admin has no such row.
--
-- So the bucket refuses Nina — the only person who was ever going to use
-- it. Not a partial failure: she can neither upload a cover nor see one.
-- Found building the setup screen's upload, 9 October, when a draft
-- launch came back "new row violates row-level security policy".
--
-- **The comment in that migration said the opposite, and was wrong.** It
-- read: "an admin passes because storage policies do not bind the service
-- role at all, and `is_portal_admin()` is not consulted here because an
-- admin's own client carries the service key." Nina's browser session
-- carries an ordinary `authenticated` JWT like everybody else's. The
-- service key belongs to the cron and to `after()` jobs, neither of which
-- uploads a picture.
--
-- **Every other table in this module grants the admin through a separate
-- permissive policy**, not through the access functions:
--
--     report_launches_all_admin :: is_portal_admin()
--
-- Permissive policies are OR'd, so that one arm is what lets an admin
-- through while the narrower arms stay exactly as written. The bucket
-- gets the same shape, for the same reason — one pattern across the
-- module, so the next person reading either finds what they expect.
--
-- **This does NOT weaken the lock, and it does not tighten it either.**
-- It matches the tables: `guard_report_launch_edits` already returns
-- early for `is_portal_admin()`, so an admin may change a published
-- launch at the database level, and the screen is what holds her to
-- unpublish → fix → republish (`LaunchLock` renders the setup and entry
-- forms read-only, cover included). A storage rule stricter than the
-- table rule beside it would be a surprise, not a safeguard.

create policy launch_covers_admin
  on storage.objects for all
  to authenticated
  using (bucket_id = 'launch-covers' and public.is_portal_admin())
  with check (bucket_id = 'launch-covers' and public.is_portal_admin());

comment on policy launch_covers_admin on storage.objects is
  'The admin arm, OR''d with the four narrower ones — the same shape as report_launches_all_admin. Without it the bucket refused Nina outright, because report_can_edit asks for a report_access row and an admin has none (Dom, 9 Oct 2026).';
