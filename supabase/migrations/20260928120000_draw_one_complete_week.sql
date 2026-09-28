-- aOS — one ten-hour week puts you in the draw.
--
-- Round 6 §3. The bar was `complete_weeks >= weeks_in_month(month)`: every
-- Monday-week of the month had to be a ten-hour week, four or five of them.
-- Every member-facing sentence in the product says something else, and has
-- since they were written:
--
--   · the weekly log's card — "Ten hours logged. You're eligible for this
--     month's prize draw."
--   · the Wednesday email — "Ten hours is what makes you eligible for this
--     month's prize draw."
--   · the Friday email — "Ten-hour weeks are what put you in the monthly
--     prize draw."
--
-- So the product has been promising a bar four to five times easier than the
-- one it applied. Nina's answer (round 6, via Dom): go with what members have
-- been told. One complete week in the month, and you are in.
--
-- This changes who wins a prize, so it is written down rather than quietly
-- adjusted. Nothing else moves: `complete_weeks_in_month` still counts
-- ten-hour weeks and is still what gets recorded on the entry, so a draw
-- already run keeps the number that counted at the time.
--
-- `weeks_required` stays in the return type and now returns 1 — the admin
-- page reads it as "n of the required", and a column removed would be a
-- second, unrelated change to make at the same time.

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
         1,
         public.complete_weeks_in_month(m.id, p_month) >= 1
  from public.members m
  where m.status = 'active'
    and m.role = 'member'
  order by m.full_name;
end;
$$;

comment on function public.draw_eligibility(date) is
  'Who is in the month''s draw: one ten-hour week is the bar (round 6), which is what every reminder email and the log''s own card have always said.';
