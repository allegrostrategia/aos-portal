-- aOS Reporting — clearing a top-three line.
--
-- NOT APPLIED TO LIVE. Applied locally only; shown to Dom for approval.
--
-- `report_top_items` has select, insert and update policies for an editor
-- and no delete policy at all, so only an admin can remove a line. That
-- is not a rule anybody decided — the three other policies were written
-- and the fourth was not — and it fails in the worst way: a delete that
-- matches no row under RLS is not an error, so Elize clearing a hook she
-- typed into the wrong row would be told "Saved" and find it still there.
--
-- Deleting here is right where it would be wrong almost anywhere else in
-- this schema. Rule 7 is about never losing a client's record; a hook
-- typed into the wrong row is not a record of anything, and the
-- alternative is a blank numbered line nobody can get rid of. The
-- month's figures are untouched either way.
--
-- Same condition as the writes that are already there, so this grants
-- nothing the editor cannot already do by overwriting the row.

create policy report_top_items_delete_editors
  on public.report_top_items for delete
  to authenticated
  using (public.report_can_edit(workspace_id));
