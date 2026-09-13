-- aOS — the hot-seat SOP flow, turned round.
--
-- L'Editoriale redesign brief, §6. Before: Nina wrote the build record and
-- published it straight into the member's Archivio; the member could rephrase
-- it. After: Nina leaves a short comment on the build, and the *member* writes
-- the SOP for it themselves, using the same template they use for anything
-- else they document — with Nina's comment beside the form as guidance.
--
-- **This undoes shipped, tested behaviour on purpose.** The change is
-- additive at the schema: `body`, `confirmed_at` and `confirmed_by` stay, so
-- every write-up Nina has already published is still there and still reads.
-- What stops is new ones being written that way — the admin screen for it is
-- removed in the same change. A hot-seat row's `sop` column, until now used
-- only by member-written entries, is where the member's SOP for the build goes.
--
-- The comment is Nina's, so the member must not be able to change it. It
-- joins the guard trigger's blocklist. This is the fourth table where the
-- policy grants the row and the trigger keeps the columns straight, and the
-- reason is the same each time: RLS is row-level.

alter table public.handover_pack
  add column coach_note text;

-- `sop` was constrained to member-written entries: "a hot seat write-up with
-- structured steps would mean the source no longer says what a row is." That
-- was right under the old flow and is exactly what the new flow needs — the
-- source still says who *initiated* the entry (a build Nina named, or an SOP
-- the member started), and `sop` now says the member has documented it, on
-- either. The constraint is dropped, not loosened: the column comment below
-- carries the new meaning.
alter table public.handover_pack
  drop constraint handover_pack_sop_is_member_sop;

comment on column public.handover_pack.sop is
  'Member-authored SOP template content. On a member_sop row it is the whole entry; on a hot_seat row it is the member''s own SOP for the build Nina named, written after the session with her coach_note beside it.';

comment on column public.handover_pack.coach_note is
  'Nina''s short comment on a hot-seat build, left after the session. Shown beside the member''s own SOP form for that build as guidance. Admin-only to write.';

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
     or new.coach_note is distinct from old.coach_note
  then
    raise exception 'That part of the entry is not yours to change';
  end if;

  -- §8: Nina names a build. An SOP the member wrote is theirs to name, rename
  -- and rewrite entirely. The member's SOP *for* a build lives in `sop` on the
  -- same row, and that column is theirs on either kind of entry.
  if old.source = 'hot_seat' and new.title is distinct from old.title then
    raise exception 'The title of a build write-up is not yours to change';
  end if;

  return new;
end;
$$;
