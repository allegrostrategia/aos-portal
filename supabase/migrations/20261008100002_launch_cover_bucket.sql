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
-- THE SAME RULES AS THE LAUNCH ITSELF
--   Read is `report_can_read_launch`, which is what the launch's own
--   tables use — so the cover appears when the launch does, and a client
--   cannot open the cover of a draft launch they do not know exists.
--   Write is `report_can_edit` AND not `report_launch_is_locked`, so a
--   cover cannot be swapped on a launch the client has already seen: the
--   picture is part of the report, like every figure on it.
--
--   Every one of those is the function the tables already call, not a copy
--   of its rule, so the two cannot drift. A cancelled member loses the lot
--   with everything else, because `report_can_view` underneath them all
--   carries `has_portal_access()`.
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

-- And the launch, from the second segment with its extension dropped.
-- Same shape, same reason: null rather than an exception.
create or replace function public.report_launch_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part((string_to_array(p_name, '/'))[2], '.', 1)::uuid;
exception
  when others then return null;
end;
$$;

comment on function public.report_launch_from_path(text) is
  'The launch id in the second segment of a storage path, or null. Null rather than an exception, because a storage policy that raises is an error page instead of a refusal.';

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
-- READ: the same question the launch itself answers.
--
-- **Not `report_can_view` on the workspace**, which was the first version
-- and was wrong (Dom, 8 October): it would have let a client open the
-- cover of a DRAFT launch — a launch they cannot otherwise see exists.
-- `report_can_read_launch` is the function the launch tables already use,
-- and it carries the published check with it, so the cover becomes
-- visible at exactly the moment the launch does and not a moment before.
create policy launch_covers_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_read_launch(public.report_launch_from_path(name))
  );

-- WRITE, REPLACE, REMOVE: an editor's, and not on a published launch.
--
-- The second correction. A cover is part of the report, so swapping one on
-- a launch the client has already seen is the same act as moving a figure
-- — and the launch lock refuses that. Without this the picture was the one
-- thing on the page that could still change underneath them.
--
-- `report_launch_is_locked` is the lock's own function rather than a copy
-- of its rule, so the two cannot drift, and it already admits the admin
-- and the service role by being false for nobody they are: an admin passes
-- because storage policies do not bind the service role at all, and
-- `is_portal_admin()` is not consulted here because an admin's own client
-- carries the service key.
create policy launch_covers_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
    and not public.report_launch_is_locked(public.report_launch_from_path(name))
  );

create policy launch_covers_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
    and not public.report_launch_is_locked(public.report_launch_from_path(name))
  )
  with check (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
    and not public.report_launch_is_locked(public.report_launch_from_path(name))
  );

create policy launch_covers_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'launch-covers'
    and public.report_can_edit(public.report_workspace_from_path(name))
    and not public.report_launch_is_locked(public.report_launch_from_path(name))
  );
