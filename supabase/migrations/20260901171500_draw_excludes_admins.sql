-- aOS — the draw is for members, not the person running it.
--
-- `draw_eligibility()` filtered on `status = 'active'` alone. Nina's own row is
-- active like everyone else's — the thing that separates her is `role`, which is
-- how the reminder scheduler has always picked members (see
-- `lib/jobs/runner.ts`). So she appeared in the eligibility list every month,
-- and if she ever tracked ten-hour weeks she would have been entered into a draw
-- for a prize she is giving away.
--
-- Found by a test on the hot seat prep sheet, which had the same bug for the
-- same reason: "active member" and "member" are not the same set, and only one
-- of them is who these features are for.

create or replace function public.draw_eligibility(p_month date)
returns table (
  member_id uuid,
  full_name text,
  complete_weeks integer,
  weeks_required integer,
  is_eligible boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can read draw eligibility';
  end if;

  return query
  select m.id,
         m.full_name,
         public.complete_weeks_in_month(m.id, p_month),
         public.weeks_in_month(p_month),
         public.complete_weeks_in_month(m.id, p_month)
           >= public.weeks_in_month(p_month)
  from public.members m
  where m.status = 'active'
    and m.role = 'member'
  order by m.full_name;
end;
$$;
