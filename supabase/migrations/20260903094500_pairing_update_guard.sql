-- aOS — a member may confirm they met, and nothing else.
--
-- `pairings_update_met_own` says in its comment that "nothing else about the
-- pairing is theirs to change — matching and the day-7 flag are the system's and
-- Nina's respectively". The policy doesn't enforce that: RLS is row-level, so a
-- member with permission to update their own pairing may update every column of
-- it, including clearing `flagged_at` to hide a stalled pairing from Nina, or
-- moving `scheduled_for` to a time the other person never agreed to.
--
-- Same problem the `members` table has, solved the same way: a trigger, because
-- column-level restrictions can't be expressed in a policy alone.
--
-- Written now because the pairing UI is what first makes this reachable — until
-- there was a screen, nobody could update a pairing at all.

create or replace function public.guard_pairing_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() then
    return new;
  end if;

  if new.pairing_month is distinct from old.pairing_month
     or new.scheduled_for is distinct from old.scheduled_for
     or new.flagged_at is distinct from old.flagged_at
     or new.id is distinct from old.id then
    raise exception 'Only confirming you met is yours to change on a pairing';
  end if;

  return new;
end;
$$;

create trigger pairings_guard_member_update
  before update on public.pairings
  for each row
  execute function public.guard_pairing_member_update();
