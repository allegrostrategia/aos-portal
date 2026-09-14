-- aOS — push notifications: where each device's subscription lives, and what
-- a member wants pushed (round 2 brief, F).
--
-- One row per device. A subscription is a browser's endpoint plus two keys;
-- the endpoint is unique on its own (a device re-subscribing replaces its
-- row), and a member can have several (phone, laptop). Rows are the member's
-- to create and remove; nothing else reads them except the sender, which runs
-- with the service role.
--
-- Two switches on members, separate from the email ones: push is a different
-- channel with different tolerance. Default on for messages, off for
-- reactions — a buzz for every clap is the kind of thing people turn off
-- entirely, and then miss the messages too.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  -- Set when a push comes back 404/410: the device is gone. Kept rather than
  -- deleted so a later resubscribe from the same device replaces it cleanly.
  expired_at timestamptz
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

create policy push_subscriptions_update_own
  on public.push_subscriptions for update
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()));

create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

create policy push_subscriptions_all_admin
  on public.push_subscriptions for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

alter table public.members
  add column push_chat boolean not null default true,
  add column push_reactions boolean not null default false;

comment on column public.members.push_chat is 'Push a notification for a new message in a room the member is in.';
comment on column public.members.push_reactions is 'Push a notification when somebody reacts to the member''s message. Off by default.';
