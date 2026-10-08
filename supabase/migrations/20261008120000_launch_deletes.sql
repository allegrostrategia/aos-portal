-- =============================================================================
-- An editor can take a stage back out. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Found building Stage 4's setup screens, 8 October: **no launch table has
-- a delete policy for anybody but an admin.** So Elize could add a stage
-- and never remove it, add a price option and never remove it, and type a
-- figure and never clear it — each one failing by matching no row, which
-- under RLS is not an error at all.
--
-- The actions already notice, because they read back what went rather than
-- trusting the call, and say "it needs an admin". That is honest and it is
-- not the behaviour anybody wants: §6.1 has stages "added in order", and
-- adding implies taking back out.
--
-- The fourth time this exact gap has appeared — report_top_items,
-- report_values, report_targets, and now these three. The pattern is
-- always the same: a screen clears something, the delete matches nothing,
-- and the only reason it was ever noticed is a read-back.
--
-- **Safe to add only because the guard already exists.** Shipped this
-- morning: `guard_report_published_launch` refuses every write to a
-- published retainer launch, delete included, precisely so that adding a
-- delete policy later could not reopen it. This is that later.
--
-- An emptied figure must be REMOVED rather than stored as zero. §4's dash
-- depends on the difference between a figure nobody entered and a figure
-- entered as nothing, and a zero would draw a bar where there should be a
-- gap.

create policy report_launch_stages_delete_editors
  on public.report_launch_stages for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

create policy report_launch_prices_delete_editors
  on public.report_launch_prices for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

create policy report_launch_values_delete_editors
  on public.report_launch_values for delete
  to authenticated
  using (public.report_can_edit_launch(launch_id));

comment on policy report_launch_stages_delete_editors on public.report_launch_stages is
  'A stage added by mistake comes back out. Bounded by guard_report_published_launch, which refuses it once the launch has gone out.';

comment on policy report_launch_prices_delete_editors on public.report_launch_prices is
  'A price option that was never offered comes back out. Same bound.';

comment on policy report_launch_values_delete_editors on public.report_launch_values is
  'An emptied box removes the figure rather than storing a zero — §4''s dash depends on the difference. Same bound.';
