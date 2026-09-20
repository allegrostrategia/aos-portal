-- aOS — peer pairing availability becomes real dates and times.
--
-- Brief: docs/aOS_Peer_Pairing_Date_Availability_Brief.md, 21 September 2026.
-- A deliberate reversal of tested behaviour, not an addition: the weekday ×
-- part-of-day grid ("tue-pm") is retired entirely. Nina's reasoning is that
-- nobody has the same availability every Tuesday, so a recurring pattern never
-- described anyone's diary and an overlap found in it was a guess.
--
-- The column keeps its shape — `availability.slots`, a jsonb array of text —
-- and only the vocabulary changes: a slot is now the UK wall-clock start of one
-- hour on one date, "2026-10-06T14:00". `pairing_shared_slots()` intersects
-- strings and needed no change.
--
-- Two things do change here:
--
--   1. `pairings.overlap_checked_at` — when the app compared the pair's picks
--      and told them both the result. Set once, by the app, the moment the
--      second partner submits (or when matching finds both already have). It
--      is what stops the message going twice, so a member must not be able to
--      clear it: it joins the guard trigger's blocklist.
--
--   2. The rows written under the old grid are cleaned up. Their keys are
--      stripped, and for the current month onward `submitted_at` is cleared so
--      the member is asked again — an old answer isn't an answer to the new
--      question. Past months keep their (now empty) rows as a record that the
--      member responded, since nothing is ever deleted (rule 7).

alter table public.pairings
  add column overlap_checked_at timestamptz;

comment on column public.pairings.overlap_checked_at is
  'When the app compared both members'' picked slots and told them the result. Set once by the app, never by a member.';

-- The guard gains the new column. Otherwise as 20260921090000: booked_at and
-- met_at stay the pair's own; an admin or the service role may set the rest.
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
     or new.overlap_checked_at is distinct from old.overlap_checked_at
     or new.id is distinct from old.id then
    raise exception 'Only booked and met are yours to change on a pairing';
  end if;

  return new;
end;
$$;

comment on function public.guard_pairing_member_update() is
  'A member may set booked_at and met_at on their own pairing, and nothing else — matching, the day-7 flag and the overlap check are the system''s (service role, no uid) and Nina''s. Column-level restriction, which a policy cannot express.';

-- Legacy rows. A slot under the old grid matched ^(mon|tue|wed|thu|fri)-(am|pm|eve)$;
-- anything of that shape is stripped. Matched on shape rather than on "not the
-- new shape" so a row that somehow already holds the new keys is left alone.
with legacy as (
  select id,
         coalesce(
           (select jsonb_agg(s) from jsonb_array_elements_text(availability->'slots') s
            where s !~ '^(mon|tue|wed|thu|fri)-(am|pm|eve)$'),
           '[]'::jsonb
         ) as kept
  from public.pairing_availability
  where exists (
    select 1 from jsonb_array_elements_text(coalesce(availability->'slots', '[]'::jsonb)) s
    where s ~ '^(mon|tue|wed|thu|fri)-(am|pm|eve)$'
  )
)
update public.pairing_availability pa
set availability = jsonb_build_object('slots', legacy.kept),
    submitted_at = case
      when pa.pairing_month >= date_trunc('month', now())::date then null
      else pa.submitted_at
    end
from legacy
where pa.id = legacy.id;
