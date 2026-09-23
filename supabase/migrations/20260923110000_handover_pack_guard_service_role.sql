-- aOS — the build guard admits the service role.
--
-- Second instance of the pattern CLAUDE.md now names, found by walking into it
-- again on 23 September: `guard_handover_pack_member_update` returns early for
-- `is_portal_admin()` and nothing else, so a write with the service role — no
-- JWT, `auth.uid()` null, `is_portal_admin()` false — is refused as if it were
-- a member trying to confirm their own build.
--
-- Unlike the pairing day-7 flag, nothing in the app hits this today: no server
-- action or cron job writes `handover_pack` with the service role. This is
-- closing a latent trap rather than fixing a live fault, and it is worth
-- closing because the trap is now confirmed as recurring — the same shape has
-- cost a silent production bug once and an hour of confusion twice.
--
-- What a member may do is unchanged, and that is the point of the narrow edit:
-- the blocklist below is exactly as it was, and only the early return grows.
-- Members still cannot set `confirmed_at`, `confirmed_by`, `source`,
-- `drafted_by`, `station_slug` or `coach_note`, and still cannot rename a
-- build Nina wrote up (§8: an SOP they wrote is theirs to name; a hot seat
-- write-up is not).

create or replace function public.guard_handover_pack_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An admin, or the system itself. The service role carries no JWT, so it has
  -- no uid — the same test `accrue_hours_for_week` and the pairing guard use.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.member_id is distinct from old.member_id
     or new.source is distinct from old.source
     or new.drafted_by is distinct from old.drafted_by
     or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by
     or new.station_slug is distinct from old.station_slug
     or new.coach_note is distinct from old.coach_note
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

comment on function public.guard_handover_pack_member_update() is
  'A member may edit their own SOP and its title where they wrote it; confirmation, provenance, the coach note and a hot seat build''s title are Nina''s and the system''s. Admin or service role (no uid) passes.';
