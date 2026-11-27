-- aOS Reporting — a client can exist before their login does.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Nina, 27 November 2026: she does not want a reporting client invited
-- before their data is in. The first thing a client ever receives from
-- aOS is that invitation, and today it is sent by the same press that
-- creates the workspace — so the only way to have figures ready before
-- they can look is to not create them until you are ready, which is
-- also the only way to enter the figures. The two steps are now:
--
--   1. Set up client — the workspace, with the contact's name and
--      address written down and no login anywhere. The team enters
--      figures and publishes against it.
--   2. Send invitation — makes the login, grants it the client role,
--      and sends the email.
--
-- WHAT THAT COSTS IN THE SCHEMA, AND WHY IT IS SPELLED OUT RATHER THAN
-- RELAXED
--
-- `report_workspaces.owner_user_id` has been `not null` since 30
-- September, and `create_report_workspace()` makes the workspace and its
-- client grant in one call so that "the app can never leave a workspace
-- nobody can reach". That promise is the thing in the way, and it is a
-- good promise: a workspace with no owner and no grant is invisible to
-- everyone but an admin.
--
-- So it is replaced rather than dropped. A workspace must now know
-- either who its client IS or who it is GOING to be — `owner_user_id`,
-- or a pending name and address — which is the same guarantee one step
-- earlier, and a check constraint says so. `create_report_workspace()`
-- is left exactly as it was, still making both halves in one call, for
-- the member and the seed paths that use it; the two-step flow gets two
-- functions of its own, each refusing what it must.
--
-- WHAT THIS DOES NOT TOUCH
--
--   · **Who can read a workspace.** `report_can_view()` and
--     `report_can_edit()` are grant-based and never look at
--     `owner_user_id`, so a workspace with no owner admits exactly the
--     people a workspace with an owner and no grant would: admins by
--     policy, assigned team members by their grant. Nobody new.
--   · **Publishing.** `publish-send.ts` has refused to email a
--     workspace with no client grant since 5 October — "This client has
--     no client login yet, so there was nobody to email. The month is
--     published; add their login and send again." That sentence was
--     written for a different reason and is exactly right for this one,
--     so the publish path needed no change at all.
--   · **Existing clients.** Every workspace that exists has an owner and
--     a grant, so every one of them reads as invited and behaves as it
--     did. Nothing is backfilled because there is nothing to backfill.

-- ===========================================================================
-- 1. A workspace may be waiting for its client
-- ===========================================================================
alter table public.report_workspaces
  alter column owner_user_id drop not null;

comment on column public.report_workspaces.owner_user_id is
  'The client of record, or null while the client has been set up and not yet invited (Nina, 27 Nov 2026). For kind = ''aos_member'' this IS members.id. Null is only ever the pre-invitation state: report_workspaces_has_a_client keeps a workspace from having neither an owner nor a pending contact.';

alter table public.report_workspaces
  add column if not exists pending_client_email text,
  add column if not exists pending_client_name text;

comment on column public.report_workspaces.pending_client_email is
  'Where the invitation will go, until it goes. Cleared by invite_report_client_login() the moment the login exists, so the address a report is read by is the login''s own and there is never a second copy of it to disagree (27 Nov 2026).';
comment on column public.report_workspaces.pending_client_name is
  'What the client contact is called, until their grant carries it. Becomes report_access.display_name when they are invited, and is cleared in the same statement.';

-- **The promise that replaces `not null`.** A workspace knows who its
-- client is, or who it is going to be — never neither. Without this, a
-- bug that forgot the pending contact would leave a workspace that can
-- never be invited through the product and reads as "Not invited yet"
-- for ever, with no address to send to.
alter table public.report_workspaces
  drop constraint if exists report_workspaces_has_a_client;
alter table public.report_workspaces
  add constraint report_workspaces_has_a_client
  check (
    owner_user_id is not null
    or (pending_client_email is not null and pending_client_name is not null)
  );

-- And the pending pair moves together: half of it is not a contact.
alter table public.report_workspaces
  drop constraint if exists report_workspaces_pending_pair;
alter table public.report_workspaces
  add constraint report_workspaces_pending_pair
  check (
    (pending_client_email is null) = (pending_client_name is null)
  );

-- **And it is a waiting room, not a second address book.** Once the
-- login exists, the contact's name is on their grant and their address
-- is on their account; a pending copy left behind would be a second
-- answer to "where do we email this client", free to disagree with the
-- first and invisible on every screen, because every screen reads the
-- grant. `invite_report_client_login()` clears the pair as it sets the
-- owner and this makes that the only possible state — including for the
-- settings form, which otherwise had nothing stopping it writing an
-- address onto an invited client.
alter table public.report_workspaces
  drop constraint if exists report_workspaces_pending_only_before_the_login;
alter table public.report_workspaces
  add constraint report_workspaces_pending_only_before_the_login
  check (owner_user_id is null or pending_client_email is null);

-- Not validation for its own sake: this address is what an invitation is
-- sent to, by a service-role call that does not ask again. Something
-- that is not an address at all should be refused where it is typed,
-- not discovered by a bounce.
alter table public.report_workspaces
  drop constraint if exists report_workspaces_pending_email_shape;
alter table public.report_workspaces
  add constraint report_workspaces_pending_email_shape
  check (
    pending_client_email is null
    or pending_client_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

-- Blank is not a name, and `btrim` is what the function below stores.
alter table public.report_workspaces
  drop constraint if exists report_workspaces_pending_name_not_blank;
alter table public.report_workspaces
  add constraint report_workspaces_pending_name_not_blank
  check (pending_client_name is null or btrim(pending_client_name) <> '');

-- ===========================================================================
-- 2. Who may change where the invitation goes
-- ===========================================================================
-- The guard has held the kind, the owner, the access window and the
-- first month to admins since 30 September. The pending contact joins
-- them: an editor who could retype the address could point a client's
-- first email, and the login it creates, at themselves. Elize enters
-- figures; who gets invited is Nina's.
--
-- Restated whole from `20260930120000`, which is the only version of it
-- — checked against `pg_get_functiondef` on live rather than assumed,
-- after the 19 November near-miss where a guard was restated from the
-- wrong one of two.
create or replace function public.guard_report_workspace_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `auth.uid() is null` is the service role: the cron and `after()` jobs have
  -- no JWT, so is_portal_admin() is false for them. A guard admitting only
  -- admins refuses the system — this codebase has been bitten twice (the day-7
  -- pairing flag, the handover pack), and the Chiarezza expiry sweep writes
  -- access_end_date, which is one of the columns blocked below.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.kind is distinct from old.kind
     or new.owner_user_id is distinct from old.owner_user_id
     or new.access_end_date is distinct from old.access_end_date
     or new.first_month is distinct from old.first_month
     or new.pending_client_email is distinct from old.pending_client_email
     or new.pending_client_name is distinct from old.pending_client_name
  then
    raise exception 'Only an admin can change a workspace''s kind, owner, access end date, first month or pending contact';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_workspace_admin_fields() is
  'An editor may set hidden categories, benchmark answers, target rate, name and currency; kind, owner, access window, first month and who the invitation goes to are Nina''s (27 Nov 2026).';

-- ===========================================================================
-- 3. Step one: the client, with no login
-- ===========================================================================
create or replace function public.set_up_report_client(
  p_kind public.report_workspace_kind,
  p_business_name text,
  p_client_name text,
  p_client_email text,
  p_first_month date,
  p_currency text default 'GBP',
  p_access_end_date date default null
)
returns public.report_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.report_workspaces;
  v_email text := lower(btrim(p_client_email));
  v_name text := btrim(p_client_name);
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can set up a reporting client';
  end if;

  -- An aOS member's workspace is created with the member, by
  -- `ensure_member_report_workspace`, attached to the login they already
  -- have. Setting one up here would make a second workspace for the same
  -- person and an invitation to an address that is already an account.
  if p_kind = 'aos_member' then
    raise exception 'An aOS member''s workspace comes with their member record, not from here';
  end if;

  insert into public.report_workspaces (
    owner_user_id, kind, business_name, currency, first_month, access_end_date,
    pending_client_email, pending_client_name
  )
  values (
    null, p_kind, p_business_name, p_currency,
    date_trunc('month', p_first_month)::date, p_access_end_date,
    v_email, v_name
  )
  returning * into v_workspace;

  return v_workspace;
end;
$$;

comment on function public.set_up_report_client(public.report_workspace_kind, text, text, text, date, text, date) is
  'Step one of two (Nina, 27 Nov 2026): the workspace, so figures can be entered and a month published, with the contact written down and no login created and no email sent. invite_report_client_login() is step two.';

-- ===========================================================================
-- 4. Step two: the login, the grant and the send
-- ===========================================================================
-- The auth user is made by the action, because creating one is an Auth
-- API call and not a thing SQL can do. What is left is the half that has
-- to be a transaction: the workspace's owner, the client grant, and the
-- pending contact going away as the grant takes it on.
create or replace function public.invite_report_client_login(
  p_workspace_id uuid,
  p_user_id uuid
)
returns public.report_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.report_workspaces;
  v_access public.report_access;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can invite a reporting client';
  end if;

  -- **Locked, not just read.** Two presses of Send invitation a second
  -- apart — a double-click, or Nina and a second admin on the same
  -- screen — would otherwise both pass the check below and the second
  -- would make a stray login that owns nothing. The row lock makes the
  -- second one wait and then be refused, which is what the action's
  -- rollback expects.
  select * into v_workspace
    from public.report_workspaces
   where id = p_workspace_id
     for update;

  if v_workspace.id is null then
    raise exception 'No such client';
  end if;

  if v_workspace.owner_user_id is not null then
    raise exception 'That client already has a login';
  end if;

  if v_workspace.pending_client_name is null then
    raise exception 'That client has no contact name to invite';
  end if;

  update public.report_workspaces
     set owner_user_id = p_user_id,
         -- Cleared in the same statement that sets the owner, so the
         -- contact's name and address live in exactly one place at every
         -- moment: the pending columns before, the grant and the login
         -- after. Two copies that can disagree is the shape of bug this
         -- codebase has paid for twice.
         pending_client_email = null,
         pending_client_name = null
   where id = p_workspace_id;

  insert into public.report_access (workspace_id, user_id, role, display_name, assigned_by)
  values (p_workspace_id, p_user_id, 'client', v_workspace.pending_client_name, (select auth.uid()))
  returning * into v_access;

  return v_access;
end;
$$;

comment on function public.invite_report_client_login(uuid, uuid) is
  'Step two of two (Nina, 27 Nov 2026): the login becomes this workspace''s client. Sets the owner, grants the client role with the name typed at set-up, and clears the pending contact in the same transaction.';

revoke all on function public.set_up_report_client(public.report_workspace_kind, text, text, text, date, text, date) from public;
revoke all on function public.invite_report_client_login(uuid, uuid) from public;

grant execute on function public.set_up_report_client(public.report_workspace_kind, text, text, text, date, text, date) to authenticated;
grant execute on function public.invite_report_client_login(uuid, uuid) to authenticated;
