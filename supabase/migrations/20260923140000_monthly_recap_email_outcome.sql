-- aOS — what happened to the recap's email.
--
-- Dom, 23 Sep: the first real send arrived in nobody's inbox, and there was no
-- way to answer "did it reach Resend?" from inside the product. The send runs
-- in `after()`, so the action has already returned by the time it fails; the
-- only record was a line in Vercel's log, which needs an interactive login to
-- read. That is a silent failure in a feature Nina uses unattended, which is
-- the shape of the bug this codebase keeps meeting.
--
-- So the outcome is written down where she is already looking. Exactly one of
-- these is set per attempt, and a retry overwrites both.
--
--   · email_sent_at — Resend accepted it. Not proof of delivery; nothing this
--     side of the member's inbox can be.
--   · email_error   — it did not get that far, and this says why.
--
-- Both are the system's, so both join the guard's blocklist: the update policy
-- lets a member touch their own sent recap to mark it read, and any column the
-- guard doesn't name is a column they can rewrite.

alter table public.monthly_recaps
  add column email_sent_at timestamptz,
  add column email_error text;

comment on column public.monthly_recaps.email_sent_at is
  'When Resend accepted the recap email. Null means it was never accepted — see email_error.';
comment on column public.monthly_recaps.email_error is
  'Why the email did not go, in the sender''s own words. Cleared when a retry succeeds.';

create or replace function public.guard_monthly_recap_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if new.member_id is distinct from old.member_id
     or new.recap_month is distinct from old.recap_month
     or new.body is distinct from old.body
     or new.personal_line is distinct from old.personal_line
     or new.stats is distinct from old.stats
     or new.sent_at is distinct from old.sent_at
     or new.email_sent_at is distinct from old.email_sent_at
     or new.email_error is distinct from old.email_error
     or new.id is distinct from old.id then
    raise exception 'Only marking it read is yours to change on a recap';
  end if;

  return new;
end;
$$;
