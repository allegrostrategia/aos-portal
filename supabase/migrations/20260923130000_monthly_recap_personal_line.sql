-- aOS — the one line Nina writes per recap.
--
-- Her confirmed copy opened with a sentence drawn from that member's own month
-- ("One enquiry nearly slipped through again & this time, it didn't") and a
-- subject that judged it ("September's actually quite good"). Neither can be a
-- template: the first is about one person, the second is wrong the first time
-- somebody has a bad month. Dom, 23 Sep: give her a field for it instead — one
-- sentence per recap, used as the subject and as the email's opening hook.
--
-- Text, not a template. It is used verbatim, so nothing interpolates into it
-- and nothing needs escaping in it.
--
-- Note it may quote the member's own Friday reflection back to them, which is
-- the point of it and stays inside rule 6: single recipient, their own words,
-- never a shared room. It does travel into an inbox, which is worth Nina
-- knowing when she writes one.

alter table public.monthly_recaps
  add column personal_line text;

comment on column public.monthly_recaps.personal_line is
  'Nina''s one sentence for this member''s month: the email subject and its opening line. Used verbatim. Optional — the email falls back to templated wording.';

-- ---------------------------------------------------------------------------
-- The guard gains the new column
--
-- The update policy lets a member touch their own sent recap so they can mark
-- it read; the trigger is what stops that being every column. A column added
-- without being listed here is a column the member can rewrite — which is the
-- same trap `members`, `pairings` and `handover_pack` have each fallen into,
-- and the reason this migration changes the function rather than only the
-- table.
-- ---------------------------------------------------------------------------

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
     or new.id is distinct from old.id then
    raise exception 'Only marking it read is yours to change on a recap';
  end if;

  return new;
end;
$$;
