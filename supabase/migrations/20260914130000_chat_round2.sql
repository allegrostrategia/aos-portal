-- aOS — the chat overhaul, layered on what exists (round 2 brief, E).
--
-- Additive throughout: channels, direct messages, voice notes, the four
-- reactions and read tracking are untouched. Four things join them.
--
-- 1. Pins. An admin pins a message; a message is pinned at most once (the
--    primary key); only an admin unpins. The pin's row cascades from the
--    message, so deleting a pinned message can never leave a pin dangling.
--
-- 2. Image messages. chat_messages.image_path, in a private `chat-images`
--    bucket, each member's uploads under their own folder. Delivered through
--    /api/chat-image/[messageId], which checks the caller can see the message
--    and then signs — never a public URL, the same shape as voice notes. The
--    check constraint below refuses a row whose image is in somebody else's
--    folder, so one member's message can't point at another's file even if
--    the app-side check is bypassed.
--
-- 3. Search. A generated tsvector over the body with a GIN index, so search
--    is an index scan rather than LIKE across every message ever sent.
--    Visibility is RLS's, unchanged: a search only ever returns messages in
--    channels the searcher can see.
--
-- 4. Retraction. **A deliberate reversal of the standing rule.** The original
--    chat migration says "No update or delete policy, for members or admins"
--    and gives its reasons (the two-week check-in responses are a record Nina
--    reads later). Dom's confirmed change, 14 Sep 2026: a member may delete
--    their own sent messages; an admin may delete anyone's. There was no
--    admin delete before either, whatever the brief assumed — both are new
--    here. Reactions and pins go with the message by cascade. Still no
--    update: a message is sent or gone, never edited.

-- ---------------------------------------------------------------------------
-- 1. Pins
-- ---------------------------------------------------------------------------

create table public.chat_pins (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  pinned_by uuid not null references public.members (id) on delete cascade,
  pinned_at timestamptz not null default now()
);

alter table public.chat_pins enable row level security;

create policy chat_pins_select_visible
  on public.chat_pins for select
  to authenticated
  using (
    public.has_portal_access()
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and public.can_see_channel(m.channel_id)
    )
  );

create policy chat_pins_admin_only
  on public.chat_pins for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin() and pinned_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Image messages
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column image_path text;

comment on column public.chat_messages.image_path is
  'Storage path in the chat-images bucket, under the sender''s own folder. Served through /api/chat-image, never directly.';

-- A message is text, or a voice note, or a picture, or any mix; never nothing.
alter table public.chat_messages
  drop constraint chat_messages_has_content;
alter table public.chat_messages
  add constraint chat_messages_has_content check (
    nullif(btrim(coalesce(body, '')), '') is not null
    or voice_path is not null
    or image_path is not null
  );

-- The sender's own folder, enforced at the row. voice_path has the same rule
-- app-side; this one is in the database because it was cheap to put there.
alter table public.chat_messages
  add constraint chat_messages_image_is_own check (
    image_path is null or image_path like (member_id::text || '/%')
  );

create policy "chat images readable by admins"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-images' and public.is_portal_admin());

create policy "members send their own chat images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.has_portal_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members remove their own chat images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 3. Search
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column search_vector tsvector
    generated always as (to_tsvector('english'::regconfig, coalesce(body, ''))) stored;

create index chat_messages_search_idx
  on public.chat_messages using gin (search_vector);

-- ---------------------------------------------------------------------------
-- 4. Retraction
-- ---------------------------------------------------------------------------

create policy chat_messages_delete_own
  on public.chat_messages for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy chat_messages_delete_admin
  on public.chat_messages for delete
  to authenticated
  using (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- 5. "Posted as the coach"
--
-- The thread needs to know which sender is Nina, and members can't read the
-- members table. One function, returning ids only.
-- ---------------------------------------------------------------------------

create or replace function public.coach_member_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from public.members where is_coach and public.has_portal_access();
$$;

revoke all on function public.coach_member_ids() from public;
grant execute on function public.coach_member_ids() to authenticated;
