-- aOS Reporting — what happened to the publish email.
--
-- §8: "The client is emailed when it's published." The send runs after the
-- action has returned, so a failure has nowhere to surface — which is how
-- the monthly recap's email failed silently for an evening on 23 September.
-- The outcome is recorded on the period, where Nina is already looking.
--
-- Approved by Nina and Dom, 5 October 2026, from the plan at
-- claude.ai/code/artifact/7e5a8f35-1801-4a1b-90c7-40321ca38a6b — which shows
-- the guard below before and after, line by line. The only change in
-- behaviour is that three new columns are protected the same way publishing
-- already is.

alter table public.report_periods
  add column email_sent_at timestamptz,
  add column email_error text,
  add column email_to text;

comment on column public.report_periods.email_sent_at is
  'When Resend accepted the publish email. Not proof of delivery; nothing this side of the client''s inbox can be.';
comment on column public.report_periods.email_error is
  'Why it did not go, in the sender''s own words. Cleared when a retry succeeds.';
comment on column public.report_periods.email_to is
  'The address it went to, copied at send time. auth.users is not readable later without the service role, and an address can change.';

create or replace function public.guard_report_period_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The service role (no JWT, so auth.uid() is null) sends the publication
  -- email and writes its outcome. Admitting it is the fix this codebase has
  -- already had to make twice.
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  -- On insert there is no old row to compare against: a team member creating
  -- a period that arrives already published would otherwise walk straight
  -- past the update branch.
  if tg_op = 'INSERT' then
    if new.published_at is not null or new.published_by is not null
       or new.email_sent_at is not null or new.email_error is not null
       or new.email_to is not null then
      raise exception 'Only an admin can publish a report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.email_sent_at is distinct from old.email_sent_at
     or new.email_error is distinct from old.email_error
     or new.email_to is distinct from old.email_to
  then
    raise exception 'Only an admin can publish a report';
  end if;

  return new;
end;
$$;
