-- =============================================================================
-- Somewhere for a launch's cover image to live. NOT APPROVED — do not apply.
-- =============================================================================
--
-- `report_launches.cover_image_path` has existed since 30 September with
-- nowhere for the file to go. Stage 4 needs the bucket.
--
-- **In a migration, not the dashboard.** Every other bucket in this project
-- was made by hand in the Supabase dashboard, which is the thing the
-- standing rule tells us not to repeat: anything that has to be done in a
-- dashboard is a step that can silently not happen. A bucket missing in
-- production is not a broken upload — it is an upload that fails on a
-- screen nobody tested against an empty project.
--
-- PRIVATE, AND NOT BY CONVENTION (Dom, 8 October)
--   `public = false`, so there is no unauthenticated URL at all and every
--   read goes through a signed URL the app asks for. A public bucket would
--   mean a client's launch cover was readable by anyone who guessed the
--   path, forever, whatever the policies below said.
--
-- THE SAME RULES AS THE TABLES
--   Read for anyone who can view the workspace, write for anyone who can
--   edit it — `report_can_view` and `report_can_edit`, the same two
--   functions every report table uses, rather than a second set of rules
--   that can drift from them. So a retainer client can see their own
--   launch cover and cannot replace it, and a cancelled member loses it
--   with everything else, because `report_can_view` already carries
--   `has_portal_access()`.
--
-- THE PATH CARRIES THE WORKSPACE
--   `<workspace id>/<launch id>.<ext>`. The policies read the first segment
--   and ask the same question the tables ask. That makes the path part of
--   the security model, so it is parsed by a function that returns null on
--   anything unexpected rather than by a cast that would throw.

-- -----------------------------------------------------------------------------
-- Reading a workspace id out of a storage path, safely
-- -----------------------------------------------------------------------------
-- A bare `::uuid` cast raises on a path that is not shaped as expected, and
-- an exception inside a storage policy is an error page rather than a
-- refusal. Null instead: `report_can_view(null)` is false, which is the
-- right answer for a file nobody should be able to place.
create or replace function public.report_workspace_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  when others then return null;
end;
$$;

comment on function public.report_workspace_from_path(text) is
  'The workspace id at the head of a storage path, or null if the path is not shaped that way. Null rather than an exception, because a storage policy that raises is an error page instead of a refusal.';

-- -----------------------------------------------------------------------------
-- The bucket
-- -----------------------------------------------------------------------------
-- Guarded so the local harness, which has `storage.objects` but no
-- `storage.buckets`, runs the policies and skips the row — the same shape
-- as the Realtime publication guard, and for the same reason: a block that
-- only runs in production is a block nobody has watched work.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'launch-covers',
      'launch-covers',
      false,
      -- 5 MB. The covers are resized in the browser before upload, as the
      -- headshots are, so this is the ceiling on a mistake rather than the
      -- size of a normal file.
      5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Who may read and write in it
-- -----------------------------------------------------------------------------
create policy launch_covers_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_view(public.report_workspace_from_path(name))
  );

create policy launch_covers_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
  );

-- Replacing a cover is an update on the object, and removing one when the
-- launch is deleted is a delete. Both are an editor's, both are refused to
-- a client — who has no edit right on a retainer workspace at all.
create policy launch_covers_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
  )
  with check (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
  );

create policy launch_covers_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
  );
