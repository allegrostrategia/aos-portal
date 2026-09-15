-- aOS — Weekly Check-Ins: a fourth standing group channel, open on a timer.
--
-- Round 3 brief, §A. Shared, not private: every member sees every other
-- member's check-in and Nina's replies, and that is the point. Open only on
-- Monday, 2:00pm to 3:30pm UK time. Outside the window it can be read but
-- not posted in, and the screen says why.
--
-- The window is data on the channel rather than a special case in code, so
-- a second timed room (or a change of hours) is a row update. Three nullable
-- columns; a channel with none of them is open all the time, which is every
-- channel that already exists.
--
-- Enforced in the insert policy, not only in the form: a request that skips
-- the screen is still refused. `chat_channel_open` takes the instant as a
-- parameter so the schema test can ask about a Monday at 2pm without
-- waiting for one. The policy passes now().

alter table public.chat_channels
  add column window_weekday smallint
    check (window_weekday is null or window_weekday between 1 and 7),
  add column window_start time,
  add column window_end time,
  add constraint chat_channels_window_is_complete check (
    (window_weekday is null) = (window_start is null)
    and (window_weekday is null) = (window_end is null)
  ),
  add constraint chat_channels_window_is_ordered check (
    window_start is null or window_start < window_end
  );

comment on column public.chat_channels.window_weekday is
  'ISO weekday (1 = Monday) the channel accepts posts on. Null: no window, always open.';
comment on column public.chat_channels.window_start is
  'Start of the posting window, UK wall clock (Europe/London).';
comment on column public.chat_channels.window_end is
  'End of the posting window, UK wall clock, exclusive.';

-- Open at this instant? UK wall clock, because the window is a time people
-- keep, not a UTC offset: 2pm stays 2pm across the clock change.
create or replace function public.chat_channel_open(
  p_channel_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (
      select c.window_weekday is null
        or (
          extract(isodow from (p_at at time zone 'Europe/London')) = c.window_weekday
          and (p_at at time zone 'Europe/London')::time >= c.window_start
          and (p_at at time zone 'Europe/London')::time < c.window_end
        )
      from public.chat_channels c
      where c.id = p_channel_id
    ),
    false
  );
$$;

revoke all on function public.chat_channel_open(uuid, timestamptz) from public;
grant execute on function public.chat_channel_open(uuid, timestamptz) to authenticated;

-- Members post inside the window. An admin posts whenever: Nina opening the
-- room with a word before two, or answering the last one at twenty to four,
-- should not be locked out of her own touchpoint. Judgement call, flagged in
-- the round 3 notes.
drop policy chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own
  on public.chat_messages for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.can_see_channel(channel_id)
    and (public.is_portal_admin() or public.chat_channel_open(channel_id))
  );

insert into public.chat_channels
  (kind, slug, name, description, sort_order, window_weekday, window_start, window_end)
values
  ('group', 'weekly-check-ins', 'Weekly Check-Ins',
   'How your week went, and Nina''s reply. Open Mondays, 2:00 to 3:30pm.',
   4, 1, '14:00', '15:30')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  window_weekday = excluded.window_weekday,
  window_start = excluded.window_start,
  window_end = excluded.window_end;
