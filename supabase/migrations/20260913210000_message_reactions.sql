-- aOS — reactions on chat messages.
--
-- L'Editoriale redesign brief, §4: "Four fixed emoji options only (not a full
-- picker) — praise hands, star eyes, red heart, clap. Tap to react."
--
-- Fixed at the database, not just in the picker. A check constraint on the
-- four means a fifth can't arrive through any client, and the set is small
-- enough that the constraint *is* the documentation.
--
-- Visibility follows the message: if you can see the message you can see who
-- reacted, and you can only react to what you can see. That is one function
-- (`can_see_channel`) doing the work it already does for messages, rather than
-- a second copy of the channel rules here.

create table public.message_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  emoji text not null check (emoji in ('🙌', '🤩', '❤️', '👏')),
  created_at timestamptz not null default now(),

  -- One of each per person per message. Tapping again takes it back.
  primary key (message_id, member_id, emoji)
);

create index message_reactions_message_idx on public.message_reactions (message_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.message_reactions enable row level security;

create policy message_reactions_select_visible
  on public.message_reactions for select
  to authenticated
  using (
    public.has_portal_access()
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and public.can_see_channel(m.channel_id)
    )
  );

create policy message_reactions_insert_own
  on public.message_reactions for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and public.can_see_channel(m.channel_id)
    )
  );

-- Redundant with the select policy (a DELETE can only reach rows SELECT
-- exposes) and kept anyway, so that widening select never widens deletion.
create policy message_reactions_delete_own
  on public.message_reactions for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy message_reactions_all_admin
  on public.message_reactions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
