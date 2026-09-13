-- aOS — templates in the Archivio: the image, and who may touch it.
--
-- The picture lives in a private `archivio` storage bucket under the member's
-- own folder, the same shape as headshots. **The bucket itself is created in
-- the dashboard, not here** — the other three were too — so this migration
-- applies cleanly before the bucket exists and the policies simply wait for it.

alter table public.handover_pack
  add column image_path text;

comment on column public.handover_pack.image_path is
  'Storage path in the archivio bucket, under the member''s own folder. Set on template entries; a template is a picture with a name, so one without a picture is refused.';

alter table public.handover_pack
  add constraint handover_pack_template_has_image
  check (source <> 'template' or image_path is not null);

-- The member may start a template the same way they start an SOP, and remove
-- one the same way. Builds stay Nina's to create and nobody's to delete.
drop policy handover_pack_insert_own on public.handover_pack;
create policy handover_pack_insert_own
  on public.handover_pack for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and source in ('member_sop', 'ai_sop', 'template')
  );

drop policy handover_pack_delete_own_sop on public.handover_pack;
create policy handover_pack_delete_own_sop
  on public.handover_pack for delete
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and source in ('member_sop', 'ai_sop', 'template')
  );

-- ---------------------------------------------------------------------------
-- Storage: the `archivio` bucket. Private; each member reads and writes only
-- their own folder. Unlike headshots, nobody else ever needs to see these —
-- Archivio is a personal record, not a shared library.
-- ---------------------------------------------------------------------------

create policy "archivio images readable by their owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'archivio'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members upload into their own archivio folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'archivio'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members delete their own archivio images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'archivio'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
