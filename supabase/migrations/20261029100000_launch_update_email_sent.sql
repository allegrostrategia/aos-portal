-- aOS Reporting — when the launch update email last went.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Nina's decision 12 gave a published launch a "Send update to client"
-- button. Dom, 29 October: show when it last went, under the button, so
-- nobody sends it twice in an afternoon.
--
-- There was nowhere to record that. A month has `report_periods`'
-- `email_sent_at`, `email_error` and `email_to`; a launch had none of
-- them, because until the button existed a launch sent nothing at all.
-- `sendLaunchUpdateEmail` is awaited and hands its failure straight back
-- to whoever pressed the button, so only the success needs keeping —
-- one column rather than three.
--
-- **Additive and nullable.** Nothing existing changes: every launch
-- starts with a null, which reads as "not sent yet", which is true.
--
-- Two guards already sit on this table and both admit a null `auth.uid()`,
-- so the service role that sends the email can write this. That is the
-- pattern the day-7 pairing flag cost three weeks to learn, and it is
-- already right here — no change needed.

alter table public.report_launches
  add column if not exists update_email_sent_at timestamptz;

comment on column public.report_launches.update_email_sent_at is
  'When "Send update to client" last went, written by the service role that sent it. Null means never. Shown under the button so nobody sends twice (Dom, 29 October 2026).';

-- The system's column, like `published_at` and `carried` beside it.
-- Restated whole rather than patched, so the complete list of columns
-- only an admin may write stays readable in one place.
create or replace function public.guard_report_launch_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_portal_admin() or (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.published_at is not null or new.published_by is not null
       or new.carried <> '{}'::jsonb
       or new.update_email_sent_at is not null then
      raise exception 'Only an admin can publish a launch report';
    end if;
    return new;
  end if;

  if new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.carried is distinct from old.carried
     or new.update_email_sent_at is distinct from old.update_email_sent_at
  then
    raise exception 'Only an admin can publish a launch report';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_launch_publish() is
  'Elize drafts a launch, Nina publishes it (30 Sep 2026), neither a team member nor a client writes its snapshot (8 Oct 2026), and nor do they write when the client was last emailed about it (29 October 2026).';
