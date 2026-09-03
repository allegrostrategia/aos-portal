-- aOS — who the coach is, said explicitly.
--
-- The odd one out in a month's pairing gets Nina (§9). Until now that meant
-- whichever admin pressed the button, which was fine while there was one admin
-- and quietly wrong as soon as there were two: a member's coach pairing would be
-- with a developer account if a developer ran the matching.
--
-- A flag rather than "the oldest admin" or an environment variable. Ordering by
-- join date is a rule nobody can see and that changes meaning the first time
-- accounts are created out of order; config lives somewhere the database can't
-- check. A column can be constrained, and reading the row tells you the answer.

alter table public.members
  add column is_coach boolean not null default false;

-- Exactly one coach, enforced rather than assumed. The pairing code picks "the"
-- coach, and two of them would make that an arbitrary choice again.
create unique index members_only_one_coach
  on public.members ((true))
  where is_coach;

-- The coach is a member of the team, not of the programme. A coach who was also
-- an ordinary member would appear in their own rotation.
alter table public.members
  add constraint members_coach_is_admin
  check (not is_coach or role = 'admin');

-- Nobody promotes themselves to coach. The existing guard already covers role,
-- status, lifecycle dates and contract terms for exactly this reason — this is
-- one more field that belongs to the team rather than to whoever the row is
-- about, and RLS is row-level so a policy can't say so.
--
-- Honest note: today the check constraint above catches this first, because an
-- ordinary member can't hold the flag at all. So this line is defence in depth
-- rather than the rule currently doing the work, and no test isolates it —
-- there's no way to, while coach-implies-admin holds. It earns its place if that
-- ever changes (a coach who is also a member), and it costs one comparison.
create or replace function public.protect_member_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.is_coach is distinct from old.is_coach
    or new.join_date is distinct from old.join_date
    or new.onboarding_start_date is distinct from old.onboarding_start_date
    or new.cohort_start_date is distinct from old.cohort_start_date
    or new.payment_confirmed_at is distinct from old.payment_confirmed_at
    or new.contract_signed_at is distinct from old.contract_signed_at
    or new.contract_term_months is distinct from old.contract_term_months
    or new.contract_term_end_date is distinct from old.contract_term_end_date
  then
    raise exception 'Only an admin can change member role, status, lifecycle dates or contract terms';
  end if;

  return new;
end;
$$;
