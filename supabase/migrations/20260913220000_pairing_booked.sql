-- aOS — "we've booked it": a state between matched and met.
--
-- L'Editoriale redesign brief, §5: "Currently only met_at (did they actually
-- meet) and the day-7 stall flag exist. This adds a new, earlier state — a
-- simple checkbox confirming a call's been scheduled, sitting between
-- 'matched' and 'met'."
--
-- A timestamp rather than a boolean, for the same reason met_at is: "when did
-- they book it" is a question the day-7 check may want to ask, and a boolean
-- can't answer it. Either member of the pair may set or clear it — it is the
-- pair's own claim about their own call, like met_at. The guard trigger's
-- blocklist (month, proposed time, Nina's flag, id) is unchanged, so this
-- column is member-settable by construction; the function comment is updated
-- to say so, because "may confirm they met, and nothing else" was true before
-- today and would have misled someone tomorrow.

alter table public.pairings
  add column booked_at timestamptz;

comment on column public.pairings.booked_at is
  'When either member said the call is in the diary. Member-settable, like met_at; cleared by setting null.';

-- The guard's docstring, corrected. Logic unchanged.
comment on function public.guard_pairing_member_update() is
  'A member may set booked_at and met_at on their own pairing, and nothing else — matching and the day-7 flag are the system''s and Nina''s. Column-level restriction, which a policy cannot express.';
