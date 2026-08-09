-- aOS — document why admin rows have no contract fields.
--
-- The first admin is seeded by hand (see the bootstrap note in the members
-- migration) rather than through create_member(), so `contract_term_end_date`,
-- `payment_confirmed_at` and `contract_signed_at` are null on that row. That is
-- correct, not missing data: Nina isn't a paying member, and backfilling a term
-- end would put her in the recommit list — eventually prompting her to book a
-- recommit call with herself.
--
-- The rule this implies for anything reading these columns: filter on
-- `role = 'member'`, not on the column being non-null.

comment on column public.members.contract_term_end_date is
  'End of the 6-month minimum term; the recommit milestone. Null for admin rows, which are seeded by hand and have no contract. Recommit queries must filter role = ''member'' rather than assuming this is set.';

comment on column public.members.payment_confirmed_at is
  'When payment was confirmed, recorded at creation. Null for hand-seeded admin rows.';

comment on column public.members.contract_signed_at is
  'When the signed contract was confirmed, recorded at creation. Null for hand-seeded admin rows.';

comment on column public.members.join_date is
  'First time this person ever joined. Never changes, including across a rejoin, so "member since" stays true. Use onboarding_start_date for sequence logic.';

comment on column public.members.onboarding_start_date is
  'Anchor the current onboarding sequence runs from. Reset on rejoin — read this, not join_date, for cadence logic.';
