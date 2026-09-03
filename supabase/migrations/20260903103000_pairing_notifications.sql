-- aOS — telling a pair they're booked in, and telling Nina when they stall (§9).
--
-- Two more consumers of the existing due-jobs queue rather than anything new.
-- Both are per-pairing rather than calendar-driven, so they're queued at the
-- moment matching runs rather than found by the daily planner — there is nothing
-- to discover, the pairing either exists or it doesn't.
--
--   · pairing_booked — one per member, "you're paired with X this month"
--   · pairing_day7   — one per pairing, due a week later, and only actually sent
--                      if they still haven't confirmed they met
--
-- The day-7 flag goes to Nina, not to the pair (§9). Chasing two people who are
-- quietly sorting it out themselves would be noise; a stalled pairing that
-- silently never happens is the thing worth knowing about.

alter type public.due_job_kind add value if not exists 'pairing_booked';
alter type public.due_job_kind add value if not exists 'pairing_day7';
