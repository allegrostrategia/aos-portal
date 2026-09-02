-- aOS — portal chat (Step 11, Build Brief §10, §4).
--
-- Piazza Sociale: general, wins and time-tracking discussion as open channels,
-- plus direct messages — the "chat" button on a directory listing (§10) and
-- Nina's Friday/Monday touchpoint (§4).
--
-- Two things are here from the first line rather than added later, both because
-- retrofitting them across messages already written would be painful:
--
--   · `handover_pack_id`, so a two-week check-in response is attached to the
--     build it is about (§2). Without it, "what worked and what didn't" is a
--     loose message and the evidence for retiring a rate can't be found again.
--   · `testimonial_consent`, per response and off by default. Consent given once
--     as an account setting would quietly cover everything written afterwards.

create type public.chat_channel_kind as enum ('group', 'direct');

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  kind public.chat_channel_kind not null,

  -- Group channels only. A direct channel is identified by who is in it, not by
  -- a name somebody had to invent.
  slug text unique,
  name text,
  description text,
  sort_order smallint not null default 0,

  created_at timestamptz not null default now(),

  constraint chat_channels_group_is_named
    check (kind <> 'group' or (slug is not null and name is not null)),
  constraint chat_channels_direct_is_unnamed
    check (kind <> 'direct' or (slug is null and name is null))
);

-- Who is in a direct channel. Group channels have no rows here at all: everyone
-- with portal access is in them, and materialising that would mean backfilling
-- every existing channel each time a member joins.
create table public.chat_participants (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);

create index chat_participants_member_idx
  on public.chat_participants (member_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,

  body text,

  -- Path in the private `voice-messages` bucket, and how long it runs so a
  -- player can show a duration without downloading the file first.
  voice_path text,
  voice_seconds smallint check (voice_seconds is null or voice_seconds > 0),

  -- The build this message is about (§2's two-week check-in).
  handover_pack_id uuid references public.handover_pack (id) on delete set null,

  -- Opt-in at the point of writing, never required to submit (§2). A member can
  -- post their update without ever agreeing to it being reused, which is what
  -- protects the candour that makes the responses worth reading.
  testimonial_consent boolean not null default false,

  created_at timestamptz not null default now(),

  -- A message is text, or voice, or both — never neither.
  constraint chat_messages_has_content check (
    nullif(btrim(coalesce(body, '')), '') is not null or voice_path is not null
  ),
  constraint chat_messages_voice_is_complete check (
    (voice_path is null) = (voice_seconds is null)
  ),
  -- Consent is consent to reuse *this response about this build*. Without a
  -- build attached there is nothing for it to be consent to.
  constraint chat_messages_consent_needs_a_build check (
    testimonial_consent = false or handover_pack_id is not null
  )
);

create index chat_messages_channel_idx
  on public.chat_messages (channel_id, created_at desc);

create index chat_messages_build_idx
  on public.chat_messages (handover_pack_id)
  where handover_pack_id is not null;

-- ---------------------------------------------------------------------------
-- Who can see a channel
--
-- Security definer so it can read the channel and participant rows without
-- their own policies applying — which would otherwise recurse, since those
-- policies are written in terms of this function.
-- ---------------------------------------------------------------------------

create or replace function public.can_see_channel(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_portal_access() and (
    exists (
      select 1 from public.chat_channels c
      where c.id = p_channel_id and c.kind = 'group'
    )
    or exists (
      select 1 from public.chat_participants p
      where p.channel_id = p_channel_id
        and p.member_id = (select auth.uid())
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Opening a DM
--
-- The directory's chat button (§10) needs "the channel between us two", which
-- either already exists or doesn't. Doing that from the app would race: two
-- people clicking at once would make two channels and split the conversation in
-- half without either of them seeing why.
-- ---------------------------------------------------------------------------

create or replace function public.open_direct_channel(p_other_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_channel uuid;
begin
  if not public.has_portal_access() then
    raise exception 'No portal access';
  end if;

  if p_other_member_id = v_me then
    raise exception 'You cannot open a direct message with yourself';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_other_member_id and m.status <> 'cancelled'
  ) then
    raise exception 'That member is not reachable';
  end if;

  -- Exactly the two of us, and nobody else — a channel with a third person is a
  -- different conversation, not this one.
  select c.id into v_channel
  from public.chat_channels c
  where c.kind = 'direct'
    and exists (select 1 from public.chat_participants p
                where p.channel_id = c.id and p.member_id = v_me)
    and exists (select 1 from public.chat_participants p
                where p.channel_id = c.id and p.member_id = p_other_member_id)
    and (select count(*) from public.chat_participants p where p.channel_id = c.id) = 2
  limit 1;

  if v_channel is not null then
    return v_channel;
  end if;

  insert into public.chat_channels (kind) values ('direct') returning id into v_channel;
  insert into public.chat_participants (channel_id, member_id)
  values (v_channel, v_me), (v_channel, p_other_member_id);

  return v_channel;
end;
$$;

-- ---------------------------------------------------------------------------
-- The open channels (§10)
-- ---------------------------------------------------------------------------

insert into public.chat_channels (kind, slug, name, description, sort_order) values
  ('group', 'general', 'General',
   'Anything and everything. This is also where Telegram day happens.', 1),
  ('group', 'wins', 'Wins',
   'Post the thing that worked. Small counts.', 2),
  ('group', 'time-tracking', 'Time tracking',
   'What the numbers are showing you, and what to do about it.', 3);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.chat_channels enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_channels_select_visible
  on public.chat_channels for select
  to authenticated
  using (public.can_see_channel(id));

create policy chat_channels_all_admin
  on public.chat_channels for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy chat_participants_select_visible
  on public.chat_participants for select
  to authenticated
  using (public.can_see_channel(channel_id));

create policy chat_participants_all_admin
  on public.chat_participants for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy chat_messages_select_visible
  on public.chat_messages for select
  to authenticated
  using (public.can_see_channel(channel_id));

-- Chat is not in §1's locked-until-active list — the library, hot seat, pairing
-- and the draw are. Piazza Sociale is open from day one, the same as the
-- directory it sits beside, so an onboarding member can talk to people while
-- they are still finding their feet.
create policy chat_messages_insert_own
  on public.chat_messages for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.can_see_channel(channel_id)
  );

-- No update or delete policy, for members or admins. A sent message is a sent
-- message — the same rule the voice-messages bucket already applies to the audio
-- itself, and the two-week check-in responses are a record Nina reads later
-- rather than a draft. Worth revisiting if it proves too strict in practice;
-- easier to relax a rule than to recover a conversation someone edited.

revoke all on function public.can_see_channel(uuid) from public;
revoke all on function public.open_direct_channel(uuid) from public;
grant execute on function public.can_see_channel(uuid) to authenticated;
grant execute on function public.open_direct_channel(uuid) to authenticated;
