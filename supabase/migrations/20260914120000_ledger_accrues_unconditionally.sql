-- aOS — the hours-reclaimed ledger accrues every week a build is live.
--
-- Round 2 brief, D. This reverses a deliberate, tested decision: until now a
-- build's weekly rate accrued only in weeks where the member logged ten hours
-- AND submitted their log — submission being the one signal a week's data was
-- complete. Dom's confirmed change (14 Sep 2026): that gate does not apply to
-- the ledger at all. A confirmed rate accrues automatically every week it is
-- active, with no dependency on tracked hours or submission that week.
--
-- The ten-hours-and-submitted threshold is not gone. It stays exactly where it
-- also lived: as the qualifying condition for the monthly prize draw, in
-- draw_eligibility(), which reads weekly_time_totals and weekly_submissions
-- itself and never read the ledger. The two ideas are now explicitly separate:
--   · the ledger is about active build rates, every week, unconditionally;
--   · the draw is about showing up, ten hours and a signed-off log.
--
-- What stays the same here: admin/cron only; one row per member-week, so a
-- re-run is harmless; a week with no active build writes a real zero rather
-- than a missing week; the breakdown records what the number was made of.
--
-- What does NOT happen: weeks the old rule skipped are not re-run by this.
-- Their due_jobs rows are already marked skipped and the planner never
-- re-plans a job it has seen. Backfilling them is a separate, deliberate call
-- — the function is idempotent, so an admin can call it for any past week.

create or replace function public.accrue_hours_for_week(
  p_member_id uuid,
  p_week_start date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing numeric;
  v_hours numeric;
  v_breakdown jsonb;
begin
  -- Admins, and the cron, which runs with the service role and so has no JWT of
  -- its own. Members never call this: accrual is machine work, not a button, and
  -- a member able to run it could mint their own hours.
  if not (public.is_portal_admin() or (select auth.uid()) is null) then
    raise exception 'Only an admin can accrue hours';
  end if;

  select hours into v_existing
  from public.hours_ledger
  where member_id = p_member_id and week_start_date = p_week_start;

  if v_existing is not null then
    return v_existing;
  end if;

  -- Every rate active in that week. No look at time_entries or
  -- weekly_submissions: those are the draw's business now, not the ledger's.
  select coalesce(sum(r.hours_per_week), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'handover_pack_id', h.id,
               'title', h.title,
               'hours_per_week', r.hours_per_week
             )
             order by h.title
           ),
           '[]'::jsonb
         )
    into v_hours, v_breakdown
  from public.handover_pack_rates r
  join public.handover_pack h on h.id = r.handover_pack_id
  where h.member_id = p_member_id
    and r.effective_from <= p_week_start
    and (r.effective_until is null or r.effective_until > p_week_start);

  insert into public.hours_ledger (member_id, week_start_date, hours, breakdown)
  values (p_member_id, p_week_start, v_hours, v_breakdown)
  on conflict (member_id, week_start_date) do nothing;

  return v_hours;
end;
$$;
