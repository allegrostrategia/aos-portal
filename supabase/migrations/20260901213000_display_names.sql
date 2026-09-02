-- aOS — resolving a member's name for other members.
--
-- `members` is readable only by its owner and admins, deliberately: the row
-- carries email, status, join and contract dates, and RLS is row-level, so a
-- policy letting members read each other's names would hand over all of it.
--
-- Step 1 saw this coming and put `display_name` on `member_profiles` for exactly
-- this reason. Two gaps stop that being the whole answer:
--
--   · a member who hasn't finished their directory listing has no display_name,
--     and their profile isn't readable until `completed_at` is set
--   · Nina is an admin, not a directory listing, so she has no profile row at
--     all — which is why she showed up in chat as "A member"
--
-- So: one function that returns names and nothing else. Security definer, so it
-- can read past both policies, and narrow enough that reading past them is safe
-- — a name is what chat, the draw winner and pairing all need, and none of them
-- needs anything else from the row.
--
-- Showing the real name is also the safer outcome, not the riskier one. A
-- conversation where you cannot tell who you are talking to is how something
-- gets said to the wrong person.

create or replace function public.display_names(p_member_ids uuid[])
returns table (member_id uuid, display_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id,
         coalesce(nullif(btrim(p.display_name), ''), m.full_name)
  from public.members m
  left join public.member_profiles p
    on p.member_id = m.id and p.completed_at is not null
  where m.id = any(p_member_ids)
    and public.has_portal_access();
$$;

revoke all on function public.display_names(uuid[]) from public;
grant execute on function public.display_names(uuid[]) to authenticated;
