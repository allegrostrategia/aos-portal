-- =============================================================================
-- A member's reporting workspace arrives with the member. NOT APPROVED.
-- =============================================================================
--
-- Nina's decision 30: nobody should be able to reach Reporting and find
-- "no access". Today a workspace is something Nina creates by hand, one
-- at a time, on a screen built for retainer clients — so a member who
-- went looking would find nothing, and the honest fix is that there is
-- always something there.
--
-- `20261009110000` put the net up first: one `aos_member` workspace per
-- owner, enforced by a partial unique index. This is what leans on it.
--
-- -----------------------------------------------------------------------------
-- Three things it has to get right
-- -----------------------------------------------------------------------------
--
-- **1. A rejoin reuses the row, and never errors** (Dom, 9 Oct). Rule 7
-- says rejoining is full onboarding again on the SAME member row — so
-- this function runs a second time for somebody who already has a
-- workspace. It returns theirs. Not an exception, because the caller is
-- `create_member` and a refusal there would block the rejoin itself; and
-- not a second workspace, because that would split their history in two.
--
-- It is written as `insert … on conflict … do nothing` and then a
-- re-select, rather than "look, then insert". Looking first is a race:
-- two calls can both find nothing and both try, and the second gets a
-- unique violation rather than the row it asked for. Rare, and the
-- symptom would be a failed invitation.
--
-- **2. Admins are skipped** (Dom, 9 Oct). Nina's `members` row is
-- `role = 'admin'` and she is not a client of her own product — she
-- would get a self-serve workspace, a row in Reporting's member list,
-- and two reminders a month about filling in a report she does not have.
-- Returns null, which the caller treats as "nothing to do".
--
-- **3. The service role gets through.** The guard is
-- `is_portal_admin() or (select auth.uid()) is null`, not admin alone.
-- `create_member` is called from Nina's own session today, so the admin
-- arm is what runs — but a backfill or a later activation job writes
-- with the service role, which has no JWT, and a guard admitting only
-- admins refuses the system. This codebase has been bitten by that
-- twice.
--
-- -----------------------------------------------------------------------------
-- What the workspace starts as
-- -----------------------------------------------------------------------------
-- `members` has no business name — only `full_name` — so the workspace
-- is named after the person, and `/reporting/settings` is where they
-- correct it. For a while Nina's reporting list shows real names rather
-- than business names, which is a smaller problem than a member finding
-- nothing at all.
--
-- `first_month` is the month they joined, so their first report is the
-- first month they were a member for.

create or replace function public.ensure_member_report_workspace(p_user_id uuid)
returns public.report_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_workspace public.report_workspaces;
begin
  if not (public.is_portal_admin() or (select auth.uid()) is null) then
    raise exception 'Only an admin can set up a member''s reporting workspace';
  end if;

  select * into v_member from public.members where id = p_user_id;
  if not found then
    return null;
  end if;

  -- Nina is not a client of her own product.
  if v_member.role = 'admin' then
    return null;
  end if;

  insert into public.report_workspaces (
    owner_user_id, kind, business_name, currency, first_month
  )
  values (
    p_user_id, 'aos_member', v_member.full_name, 'GBP',
    date_trunc('month', coalesce(v_member.join_date, current_date))::date
  )
  on conflict (owner_user_id) where kind = 'aos_member' do nothing
  returning * into v_workspace;

  -- Null means the conflict fired: they already had one, so it is theirs.
  if v_workspace.id is null then
    select * into v_workspace
      from public.report_workspaces
     where owner_user_id = p_user_id and kind = 'aos_member';
    return v_workspace;
  end if;

  insert into public.report_access (workspace_id, user_id, role, display_name, assigned_by)
  values (v_workspace.id, p_user_id, 'client', v_member.full_name, (select auth.uid()))
  on conflict (workspace_id, user_id) do nothing;

  return v_workspace;
end;
$$;

comment on function public.ensure_member_report_workspace(uuid) is
  'A member''s own reporting workspace, created once and returned ever after. Idempotent because rule 7 makes rejoining the same row going through onboarding again. Returns null for an admin, who is not a client of her own product (Dom, 9 Oct 2026).';

revoke all on function public.ensure_member_report_workspace(uuid) from public;
grant execute on function public.ensure_member_report_workspace(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- And `create_member` calls it, so the two arrive together
-- -----------------------------------------------------------------------------
-- In the same function rather than as a third step in `inviteMember`:
-- that action already rolls back the auth user when `create_member`
-- fails, and a third step would mean deciding what to undo when IT
-- fails. Here they are one transaction — a member with no workspace
-- cannot exist, because the insert that would have made one is rolled
-- back with everything else.
create or replace function public.create_member(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_payment_confirmed_at timestamptz default now(),
  p_contract_signed_at timestamptz default now(),
  p_contract_term_months smallint default 6,
  p_join_date date default current_date,
  p_contract_term_end_date date default null
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if not public.is_portal_admin() then
    raise exception 'Only an admin can create a member';
  end if;

  if p_payment_confirmed_at is null or p_contract_signed_at is null then
    raise exception 'Payment and signed contract must both be confirmed before creating a member';
  end if;

  insert into public.members (
    id, email, full_name, status,
    join_date, onboarding_start_date,
    payment_confirmed_at, contract_signed_at,
    contract_term_months, contract_term_end_date, created_by
  )
  values (
    p_user_id, p_email, p_full_name, 'onboarding',
    p_join_date, p_join_date,
    p_payment_confirmed_at, p_contract_signed_at,
    p_contract_term_months,
    coalesce(
      p_contract_term_end_date,
      (p_join_date + make_interval(months => p_contract_term_months))::date
    ),
    (select auth.uid())
  )
  returning * into v_member;

  -- Their report exists from the moment they do (Nina's decision 30).
  perform public.ensure_member_report_workspace(v_member.id);

  return v_member;
end;
$$;
