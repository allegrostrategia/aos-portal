-- aOS — running the monthly draw (Step 8).
--
-- Build Brief §2 (The monthly draw), §4 (Completed week), §1 (Locked until active).
--
-- The tables have been here since Step 1, along with complete_weeks_in_month().
-- What was missing is what "a full month of active check-ins" actually means,
-- and the two moves Nina makes: lock the entrant list, then draw from it.
--
-- Both are functions rather than admin-panel queries, for the same reason
-- activate_member() is: the rules about what a draw means belong next to the
-- data, not in whichever screen happens to run them.

-- ---------------------------------------------------------------------------
-- What "a full month" is
--
-- The number of Mondays in the month, matching complete_weeks_in_month()'s rule
-- that a week belongs to the month its Monday falls in. Four or five depending
-- on the month, which is exactly why it's computed: hard-coding four would hand
-- an entry to someone who missed a week of a five-week month.
-- ---------------------------------------------------------------------------

create or replace function public.weeks_in_month(p_month date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(
    date_trunc('month', p_month)::date,
    (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date,
    interval '1 day'
  ) d
  where extract(isodow from d) = 1;
$$;

-- ---------------------------------------------------------------------------
-- complete_weeks_in_month() gets an access check.
--
-- It is `security definer` and takes a member id, so as it stood any signed-in
-- member could ask it about any other member and learn how many weeks they had
-- completed. Nothing in the app called it that way, but the draw is about to,
-- and a leak nobody currently walks through is still a leak.
--
-- A member's own count stays readable — that's the honest use, and a member
-- facing screen will want it — so the guard is "yourself, or an admin" rather
-- than shutting the function off. Revoking execute instead would have locked out
-- admins too, since they hold the same `authenticated` role.
--
-- plpgsql now, only so it can raise: a check that returned 0 to an unauthorised
-- caller would be indistinguishable from a member who genuinely logged nothing.
-- ---------------------------------------------------------------------------

create or replace function public.complete_weeks_in_month(
  p_member_id uuid,
  p_month date
)
returns integer
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if p_member_id <> (select auth.uid()) and not public.is_portal_admin() then
    raise exception 'Only an admin can read completed weeks for another member';
  end if;

  return (
    select count(*)::integer
    from (
      select (date_trunc('week', started_at))::date as week_start_date,
             sum(duration_minutes) as logged_minutes
      from public.time_entries
      where member_id = p_member_id
        and ended_at is not null
      group by 1
    ) w
    where w.logged_minutes >= 600
      and date_trunc('month', w.week_start_date) = date_trunc('month', p_month)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who is in, and why
--
-- Returns every active member with their count against the bar, not just the
-- ones who cleared it. Nina running the draw should be able to see that someone
-- finished on four of five weeks — that's the conversation the number is for,
-- and a list of winners-only hides it.
--
-- Onboarding and cancelled members are absent entirely (§1): eligibility is
-- earned over a month of being active, so appearing with a score of zero would
-- misrepresent why they aren't in.
-- ---------------------------------------------------------------------------

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
  order by m.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Locking the entrant list
--
-- Separate from drawing a winner on purpose. `complete_weeks` is recorded on the
-- entry as the schema intends, so a time entry edited next week can't quietly
-- change who was in a draw that already happened.
--
-- Re-runnable while the draw is still open — `on conflict do nothing` means
-- opening entries again picks up anyone who has since completed the month
-- without disturbing the entries already recorded.
-- ---------------------------------------------------------------------------

create or replace function public.open_draw_entries(p_draw_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_drawn timestamptz;
  v_added integer;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can open draw entries';
  end if;

  select draw_month, drawn_at into v_month, v_drawn
  from public.draws
  where id = p_draw_id;

  if v_month is null then
    raise exception 'No draw with id %', p_draw_id;
  end if;

  -- Once a winner is out, the entrant list is part of the record.
  if v_drawn is not null then
    raise exception 'That draw has already been drawn';
  end if;

  insert into public.draw_entries (draw_id, member_id, complete_weeks)
  select p_draw_id, e.member_id, e.complete_weeks
  from public.draw_eligibility(v_month) e
  where e.is_eligible
  on conflict (draw_id, member_id) do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drawing the winner
--
-- `drawn_at is null` sits in the UPDATE itself rather than being checked first,
-- so a double-click or a retried request is a no-op instead of a second and
-- different winner. That's the failure that would actually matter here — a draw
-- that quietly re-runs is worse than one that refuses.
--
-- random() is Postgres's PRNG rather than a cryptographic source. Adequate for a
-- monthly prize among a members' club, and the ordering is over a list already
-- fixed by open_draw_entries(), so there is nothing to game between the two.
-- ---------------------------------------------------------------------------

create or replace function public.draw_winner(p_draw_id uuid)
returns public.draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.draws;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can run the draw';
  end if;

  update public.draws
  set winner_member_id = (
        select member_id
        from public.draw_entries
        where draw_id = p_draw_id
        order by random()
        limit 1
      ),
      drawn_at = now()
  where id = p_draw_id
    and drawn_at is null
    and exists (select 1 from public.draw_entries where draw_id = p_draw_id)
  returning * into v_draw;

  if v_draw.id is not null then
    return v_draw;
  end if;

  -- Nothing updated. Say which of the three reasons it was, rather than
  -- returning a shrug that looks like a bug.
  select * into v_draw from public.draws where id = p_draw_id;

  if v_draw.id is null then
    raise exception 'No draw with id %', p_draw_id;
  elsif v_draw.drawn_at is not null then
    raise exception 'That draw already has a winner';
  else
    raise exception 'Nobody is entered in that draw yet';
  end if;
end;
$$;

revoke all on function public.weeks_in_month(date) from public;
revoke all on function public.draw_eligibility(date) from public;
revoke all on function public.open_draw_entries(uuid) from public;
revoke all on function public.draw_winner(uuid) from public;

grant execute on function public.weeks_in_month(date) to authenticated;
grant execute on function public.draw_eligibility(date) to authenticated;
grant execute on function public.open_draw_entries(uuid) to authenticated;
grant execute on function public.draw_winner(uuid) to authenticated;
