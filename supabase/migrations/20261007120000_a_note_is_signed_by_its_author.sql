-- =============================================================================
-- A note is signed by whoever wrote it. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Dom, 7 October: "fix author_name: show the name from the author's grant or
-- account instead of free text, so nobody can sign a reply as someone else."
--
-- `author_name` is what the screen prints. It has always been whatever the
-- caller sent. The 7 October policy fix stopped a TEAM MEMBER authoring a
-- client_reply at all, which closed the worst case — but it does not close
-- the rest, and Dom asked about two more:
--
--   · **An admin is not stopped by that policy.** `report_notes_all_admin` is
--     `for all` with `is_portal_admin()`, and Postgres ORs permissive
--     policies, so Nina never reaches `report_notes_write`'s CASE at all.
--     Confirmed against live. She can insert a client_reply signed with the
--     client's name.
--   · **A client can sign their own reply as anyone**, including "Nina
--     Oliver", because the name is free text for its rightful owner too.
--
-- One rule closes all of it: the author does not choose the signature.
--
-- WHY IT IS STILL STORED, NOT JOINED
--   The column's own comment gives the reason and it still holds: there is
--   nowhere to join TO — Elize and the retainer clients have no `members`
--   row by design, and `auth.users` is not readable under RLS. Storing it
--   also keeps it "the name that signed it", which is the honest thing for a
--   document the client was sent months ago. This trigger changes WHO
--   decides the value, not where it lives.
--
-- INSERT SETS IT; UPDATE REFUSES TO MOVE IT
--   Re-deriving on update would re-sign an old note whenever somebody's
--   display name changed — "Bella Rossi" becoming "Bella R" on a reply she
--   sent in August. `guard_report_note_update` already pins `author_name`
--   for non-admins; the second trigger below extends that to everyone, so a
--   signature is fixed at the moment it is written.
--
-- NO-OP ON TODAY'S DATA
--   Checked on live before writing: all six notes already carry exactly the
--   name this would derive. Nothing is rewritten by applying it.

create or replace function public.set_report_note_author_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  -- `author_id` is `on delete set null`, so a note can outlive its author.
  -- There is nothing to derive from, and what is stored is the record of
  -- who signed it — which rule 7 says to keep.
  if new.author_id is null then
    return new;
  end if;

  -- The grant first: it is per workspace, so Elize is "Elize" on one client
  -- and could be something else on another, and a retainer client is the
  -- contact name Nina typed when she set them up. The members row is the
  -- fallback for an admin, who has no grant and signs with her own name —
  -- the 5 October signature fix, which this must not undo.
  select coalesce(
           (select nullif(btrim(ra.display_name), '')
              from public.report_access ra
             where ra.workspace_id = new.workspace_id
               and ra.user_id = new.author_id),
           (select nullif(btrim(m.full_name), '')
              from public.members m
             where m.id = new.author_id)
         )
    into v_name;

  if v_name is null then
    raise exception 'That account has no name to sign a note with'
      using errcode = 'check_violation';
  end if;

  new.author_name := v_name;
  return new;
end;
$$;

comment on function public.set_report_note_author_name() is
  'The signature on a note is derived from the author''s grant, or their members row for an admin. Never from the caller (Dom, 7 Oct 2026).';

create trigger report_notes_sign_author
  before insert on public.report_notes
  for each row
  execute function public.set_report_note_author_name();

-- -----------------------------------------------------------------------------
-- And it does not move afterwards — for anybody
-- -----------------------------------------------------------------------------
-- `guard_report_note_update` already refuses this for a non-admin and returns
-- early for an admin and the service role. A separate trigger rather than a
-- change to that one, because its subject is "what a member may not change
-- about their own note" and this is "what nobody changes about anybody's".
create or replace function public.guard_report_note_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_name is distinct from old.author_name then
    raise exception 'A note keeps the name that signed it'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.guard_report_note_signature() is
  'A signature is fixed when the note is written. Applies to the admin and the service role too, unlike the other note guard.';

create trigger report_notes_signature_is_fixed
  before update on public.report_notes
  for each row
  execute function public.guard_report_note_signature();
