-- aOS — storage policies for the `training-content` bucket.
--
-- Build Brief §11 (Export rules), §6 (Content formats).
--
-- **Members get no policy here at all, deliberately.**
--
-- §11: SOPs are the only exportable content in the product. Formal training is
-- non-exportable — video streamed with no download link exposed, PDFs in an
-- embedded viewer, audio streamed rather than downloaded. A member SELECT policy
-- would undo that in one line: with one, the Storage API would list and serve
-- these objects to any signed-in member directly, and the rule would hold only
-- in the parts of the UI that remembered to honour it.
--
-- Instead every read goes through `/api/content/[id]`, which checks the member
-- may see that item — using the member's own session, so `training_content`'s
-- RLS tiering applies — and then mints a short-lived signed URL with the service
-- role. One authorisation rule, in one place, rather than the same rule written
-- twice in two languages and drifting.
--
-- This is the "soft" protection §11 describes, and the same approach as Kajabi
-- or Teachable: not airtight against a screen recording, and deliberately not
-- over-engineered to be.

create policy "admins manage training content files"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'training-content'
    and public.is_portal_admin()
  )
  with check (
    bucket_id = 'training-content'
    and public.is_portal_admin()
  );
