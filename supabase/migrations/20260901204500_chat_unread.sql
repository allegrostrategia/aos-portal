-- aOS — read state, and notifying somebody who hasn't looked (Step 11).
--
-- The Friday/Monday touchpoint (§4) is the case this exists for: a member asks
-- something on Friday, Nina replies by voice note before 9am Monday. The gap is
-- days, and nothing currently tells either of them the other has spoken.
--
-- Two mechanisms, deliberately: Realtime for anyone with the conversation open,
-- and email for the multi-day gap. Neither covers the other's case.

-- ---------------------------------------------------------------------------
-- Read state
--
-- A timestamp per member per channel, not a flag per message. "Unread" is a
-- question about where somebody got to, and one row per member per channel
-- answers it without writing a row for every message every person ever sees.
-- ---------------------------------------------------------------------------

create table public.chat_reads (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);

create index chat_reads_member_idx on public.chat_reads (member_id);

alter table public.chat_reads enable row level security;

create policy chat_reads_select_own
  on public.chat_reads for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy chat_reads_write_own
  on public.chat_reads for all
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()) and public.has_portal_access());

create policy chat_reads_select_admin
  on public.chat_reads for select
  to authenticated
  using (public.is_portal_admin());

/*
 * Mark a channel read up to now.
 *
 * Only ever moves forward. A page that loads slowly, or two tabs racing, must
 * not drag the marker backwards and re-notify somebody about messages they have
 * already read.
 */
create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_see_channel(p_channel_id) then
    return;
  end if;

  insert into public.chat_reads (channel_id, member_id, last_read_at)
  values (p_channel_id, (select auth.uid()), now())
  on conflict (channel_id, member_id) do update
    set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end;
$$;

revoke all on function public.mark_channel_read(uuid) from public;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- due_jobs gains a clock
--
-- `due_on` is a date, and the comment on it is honest about why: the cron ran
-- daily, so minute precision would have been a lie in the schema. "Unread for an
-- hour" is the first consumer that genuinely needs the time of day, so it gets a
-- real timestamp rather than the date being quietly reinterpreted.
--
-- Nullable, and the existing calendar-driven jobs keep using `due_on`. Two
-- columns is honest about there being two kinds of schedule here: one that means
-- "on this day" and one that means "at this moment".
-- ---------------------------------------------------------------------------

alter table public.due_jobs add column due_at timestamptz;

create index due_jobs_pending_at_idx
  on public.due_jobs (due_at)
  where status = 'pending' and due_at is not null;

alter type public.due_job_kind add value if not exists 'chat_unread';

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Guarded, because `supabase_realtime` is a Supabase-managed publication and
-- does not exist in the in-process Postgres the schema tests run against.
-- RLS still applies to what a subscriber receives, so a member is only told
-- about messages in channels they could already read.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;
