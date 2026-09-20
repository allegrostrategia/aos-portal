-- aOS — the pairing guard admits the service role.
--
-- `guard_pairing_member_update` (3 Sep) let an update through only for
-- `is_portal_admin()`. The cron sets `flagged_at` with the service role, which
-- carries no JWT, so `auth.uid()` is null, `is_portal_admin()` is false, and
-- the trigger has been refusing the day-7 flag in production since it was
-- added. The runner did not check the update's error, so Nina's email went,
-- the job was marked done, and the flag she'd look for on the admin page was
-- never set. The test passed because the PGlite harness left the previous
-- caller's uid in the session; the harness is fixed alongside this.
--
-- Same convention as `accrue_hours_for_week`: an admin, or no uid at all.
-- Members are unchanged — booked_at and met_at, nothing else.

create or replace function public.guard_pairing_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.pairing_month is distinct from old.pairing_month
     or new.scheduled_for is distinct from old.scheduled_for
     or new.flagged_at is distinct from old.flagged_at
     or new.id is distinct from old.id then
    raise exception 'Only booked and met are yours to change on a pairing';
  end if;

  return new;
end;
$$;

comment on function public.guard_pairing_member_update() is
  'A member may set booked_at and met_at on their own pairing, and nothing else — matching and the day-7 flag are the system''s (service role, no uid) and Nina''s. Column-level restriction, which a policy cannot express.';
