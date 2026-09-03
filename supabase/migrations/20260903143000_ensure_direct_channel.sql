-- aOS — opening a DM on somebody's behalf.
--
-- The two-week check-in (§2) asks a member to post how a build is holding up,
-- tagged to that build. It has to land somewhere, and the somewhere is their
-- conversation with Nina — candid enough for "this didn't work", and she is the
-- one who decides whether to retire the rate.
--
-- `open_direct_channel()` can't serve that: it reads `auth.uid()` to know who is
-- asking, and the job runner has no session at all. So the find-or-create moves
-- into its own function that takes both members explicitly, and the existing one
-- becomes the authorisation wrapper around it.
--
-- Split rather than duplicated. Two copies of "the channel with exactly these
-- two people in it" would be two chances to disagree about what that means.

create or replace function public.ensure_direct_channel(
  p_member_a uuid,
  p_member_b uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel uuid;
begin
  if p_member_a = p_member_b then
    raise exception 'A direct channel needs two different people';
  end if;

  -- Exactly the two of them, and nobody else — a channel with a third person is
  -- a different conversation.
  select c.id into v_channel
  from public.chat_channels c
  where c.kind = 'direct'
    and exists (select 1 from public.chat_participants p
                where p.channel_id = c.id and p.member_id = p_member_a)
    and exists (select 1 from public.chat_participants p
                where p.channel_id = c.id and p.member_id = p_member_b)
    and (select count(*) from public.chat_participants p where p.channel_id = c.id) = 2
  limit 1;

  if v_channel is not null then
    return v_channel;
  end if;

  insert into public.chat_channels (kind) values ('direct') returning id into v_channel;
  insert into public.chat_participants (channel_id, member_id)
  values (v_channel, p_member_a), (v_channel, p_member_b);

  return v_channel;
end;
$$;

-- Now the authorisation wrapper: who is asking, and may they.
create or replace function public.open_direct_channel(p_other_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
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

  return public.ensure_direct_channel(v_me, p_other_member_id);
end;
$$;

-- Not reachable by anyone signed in: it takes both members as arguments and asks
-- no questions about who is calling, so a member could use it to put themselves
-- in a conversation with anyone. Only the job runner's service role needs it.
-- One revoke is enough: EXECUTE is granted to PUBLIC by default, and
-- `authenticated` has no grant of its own, so removing the default removes the
-- only route in. Revoking from `authenticated` as well reads like a second lock
-- and is the same lock — a mutation proved it changed nothing.
revoke all on function public.ensure_direct_channel(uuid, uuid) from public;
