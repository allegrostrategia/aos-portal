-- aOS — storage policies for the `headshots` and `voice-messages` buckets.
--
-- Both buckets are private, so nothing is reachable by URL alone. These policies
-- govern direct Storage API access; the app additionally serves files through
-- short-lived signed URLs minted server-side after its own check, which is what
-- makes a restrictive policy here workable rather than obstructive.
--
-- **Path convention: every object is stored under `<member_id>/…`.** The policies
-- below read that first folder segment to decide ownership, so an upload written
-- anywhere else will be refused rather than silently becoming unreachable.

-- ---------------------------------------------------------------------------
-- headshots — the member directory (§10)
--
-- Readable by anyone with portal access, NOT only active members. §1 puts the
-- member directory in the "open from day one" list, so an onboarding member can
-- browse it — gating the images on `is_active_member()` would show them a
-- directory of names with broken pictures, which is worse than either extreme.
-- Matches `member_profiles_select_directory`, which gates on the same thing.
-- ---------------------------------------------------------------------------

create policy "headshots readable with portal access"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'headshots'
    and public.has_portal_access()
  );

create policy "members upload their own headshot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'headshots'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members replace their own headshot"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'headshots'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members delete their own headshot"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'headshots'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "admins manage headshots"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'headshots' and public.is_portal_admin())
  with check (bucket_id = 'headshots' and public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- voice-messages — chat (§4 Friday/Monday touchpoint, Step 11)
--
-- Sender and admins only, as specified.
--
-- ⚠️ INCOMPLETE BY NECESSITY, and it will not serve the feature as it stands.
-- The touchpoint is Nina voice-noting a member before 9am Monday: she is the
-- sender and an admin, so she can reach the file — and the member it was
-- recorded for cannot. A recipient clause is needed, and can't be written yet
-- because there is no chat schema to say who the recipient of a message is.
--
-- When chat lands, either add a policy joining to the messages table, or serve
-- playback exclusively through signed URLs minted after an app-level check.
-- The second is likely better: it keeps one authorisation rule in one place
-- instead of the same logic expressed twice in two languages.
-- ---------------------------------------------------------------------------

create policy "voice messages readable by their sender"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "voice messages readable by admins"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and public.is_portal_admin()
  );

create policy "members send their own voice messages"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'voice-messages'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No UPDATE policy on purpose: a sent voice message is a sent message. Replacing
-- the audio under an existing path would silently change what someone already
-- heard, or was about to.
create policy "members delete their own voice messages"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "admins manage voice messages"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'voice-messages' and public.is_portal_admin())
  with check (bucket_id = 'voice-messages' and public.is_portal_admin());
