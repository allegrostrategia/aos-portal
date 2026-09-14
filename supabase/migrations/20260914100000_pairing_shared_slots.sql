-- aOS — what a pair both ticked, readable by either of them.
--
-- The matcher computes the shared slots and the match email names them, but
-- the pairing page never could: a member may read only their own
-- availability (pairing_availability_select_own), so the page showed "no time
-- you both ticked" to everyone, always. Nothing writes pairings.scheduled_for
-- either, so the branch that would have shown a time was unreachable.
--
-- The fix is not to open the partner's availability — that is theirs. It is
-- one function that returns the intersection and nothing else, and only to a
-- participant in that pairing. Security definer, so it can read both rows;
-- the participant check is what keeps it from being a way to read anyone's.

create or replace function public.pairing_shared_slots(p_pairing_id uuid)
returns text[]
language sql
security definer
stable
set search_path = ''
as $$
  with pair as (
    select p.pairing_month, pp.member_id
    from public.pairings p
    join public.pairing_participants pp on pp.pairing_id = p.id
    where p.id = p_pairing_id
      and exists (
        select 1 from public.pairing_participants me
        where me.pairing_id = p.id and me.member_id = (select auth.uid())
      )
      and public.has_portal_access()
  ),
  slots as (
    select pa.member_id, jsonb_array_elements_text(coalesce(pa.availability->'slots', '[]'::jsonb)) as slot
    from public.pairing_availability pa
    join pair on pair.member_id = pa.member_id and pair.pairing_month = pa.pairing_month
  )
  select coalesce(array_agg(slot order by slot), '{}')
  from (
    select slot from slots group by slot
    having count(distinct member_id) = (select count(*) from pair)
  ) shared;
$$;

revoke all on function public.pairing_shared_slots(uuid) from public;
grant execute on function public.pairing_shared_slots(uuid) to authenticated;
