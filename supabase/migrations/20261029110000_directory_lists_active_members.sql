-- aOS — the directory lists active members, not everyone who ever filled a
-- profile in.
--
-- `member_profiles_select_directory` is
--
--     using (public.has_portal_access() and completed_at is not null)
--
-- and `has_portal_access()` reads `auth.uid()`. So it gates on whether the
-- person LOOKING still has access, never on the person LISTED. The migration
-- that wrote it said so, and said where the fix belonged:
--
--     "Falls out of has_portal_access() on the READER's side, but not the
--      subject's... Filter the listing query by the subject's status as well,
--      or a cancelled member stays in the directory indefinitely."
--
-- The listing query never did. So a cancelled member kept their card in every
-- other member's directory, and their row in the "new message" list in Piazza
-- Sociale — where clicking them then failed, because `open_direct_channel`
-- refuses a cancelled member. Found 29 October, auditing live accounts before
-- launch; nothing had removed anybody because nobody has been cancelled yet.
--
-- WHY A FUNCTION AND NOT A FILTER. The listing query cannot do this on its
-- own: `members_select_own` is the only non-admin read policy on
-- `public.members`, so a member's session reads its own row and nothing else.
-- A join to `members` from `searchDirectory()` returns null for every other
-- member, silently, which is worse than the bug.
--
-- WHY NOT IN THE POLICY. Tempting — one place, every caller fixed at once —
-- and wrong here: `getHeadshotUrls()` reads the same table under the same
-- policy for chat and pairing, so a cancelled member's face would vanish from
-- messages they sent while their name stayed (`display_names()` is
-- `security definer` and keeps it, deliberately). The directory is the screen
-- with the rule; this keeps the rule on that screen.

-- Which of these members are active, asked by someone who holds portal access.
--
-- Reveals one boolean per id, about ids the caller can already see in chat,
-- pairing and the directory itself — and `open_direct_channel` already answers
-- the same question out loud ("That member is not reachable"). That is the
-- whole reason this is a narrow function rather than the join the original
-- comment warned off: a join inside a policy on a table other members read
-- hands over the joined row's other columns too.
--
-- `has_portal_access()` on the caller, the same gate `display_names()` carries,
-- so a cancelled member asking gets an empty answer rather than a free lookup.
create or replace function public.active_member_ids(p_member_ids uuid[])
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(m.id), '{}'::uuid[])
  from public.members m
  where m.id = any(p_member_ids)
    and m.status = 'active'
    and public.has_portal_access();
$$;

comment on function public.active_member_ids(uuid[]) is
  'Which of these member ids are active. For the directory listing, which must drop the people it lists as well as the people reading it.';

revoke all on function public.active_member_ids(uuid[]) from public;
grant execute on function public.active_member_ids(uuid[]) to authenticated;
