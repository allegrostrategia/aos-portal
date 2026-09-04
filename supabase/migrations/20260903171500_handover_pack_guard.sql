-- aOS — what a member may change about their own Archivio entry.
--
-- §8 gives the member their own copy to rephrase: "Member can edit their own
-- copy (rephrasing in their own words). Nina provides general instructions plus
-- names it." The update policy allows that — and, because RLS is row-level,
-- allows everything else on the row too.
--
-- Two consequences that matter:
--
--   · `source` was theirs to change. Relabelling a hot seat write-up as
--     'member_sop' brings it under the delete policy, so a member could remove
--     Nina's record of what was built together — one party deleting a shared
--     record.
--   · `confirmed_at`, `confirmed_by` and `drafted_by` were theirs to set. Those
--     say who wrote a thing and when it was signed off, which is exactly the
--     kind of claim nobody should be able to make about themselves.
--
-- Third time this pattern has come up (members, pairings, now here): a policy
-- that grants row access where only some columns were meant, and a comment
-- describing a restriction the policy cannot express. Same fix — a trigger.

create or replace function public.guard_handover_pack_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() then
    return new;
  end if;

  if new.member_id is distinct from old.member_id
     or new.source is distinct from old.source
     or new.drafted_by is distinct from old.drafted_by
     or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by
     or new.station_slug is distinct from old.station_slug
  then
    raise exception 'That part of the entry is not yours to change';
  end if;

  -- §8: Nina names a build she wrote up. An SOP the member wrote is theirs to
  -- name, rename and rewrite entirely.
  if old.source = 'hot_seat' and new.title is distinct from old.title then
    raise exception 'The title of a build write-up is not yours to change';
  end if;

  return new;
end;
$$;

create trigger handover_pack_guard_member_update
  before update on public.handover_pack
  for each row
  execute function public.guard_handover_pack_member_update();
