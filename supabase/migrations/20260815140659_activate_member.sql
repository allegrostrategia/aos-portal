-- aOS — activating a member.
--
-- Build Brief §1: the full library, hot seat, peer pairing and draw eligibility
-- are locked until `status = active`, which happens at week 1 of the month
-- following their onboarding.
--
-- An RPC rather than a bare UPDATE from the admin panel, for the same reason
-- cancel_member() and rejoin_member() are: the rules about what a status change
-- means belong next to the data, not spread across whichever screen happens to
-- make them. It also keeps all four lifecycle moves reading the same way.

create or replace function public.activate_member(
  p_member_id uuid
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
    raise exception 'Only an admin can activate a member';
  end if;

  select * into v_member from public.members where id = p_member_id;

  if v_member.id is null then
    raise exception 'No member with id %', p_member_id;
  end if;

  -- Only from onboarding. A cancelled member comes back through
  -- rejoin_member(), which starts their onboarding again from scratch — going
  -- straight to active would skip the fresh audit and roadmap that §1 requires
  -- of a returning member.
  if v_member.status <> 'onboarding' then
    raise exception 'Member % is % — only an onboarding member can be activated',
      p_member_id, v_member.status;
  end if;

  update public.members
  set status = 'active'
  where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.activate_member(uuid) from public;
grant execute on function public.activate_member(uuid) to authenticated;
