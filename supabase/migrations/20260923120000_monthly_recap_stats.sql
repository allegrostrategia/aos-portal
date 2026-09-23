-- aOS — the numbers the recap's card and email quote.
--
-- Nina's confirmed copy (23 Sep) puts figures in front of the writing: "13.5
-- hours tracked & 7.5 hours reclaimed this month" on the Piazza card, and the
-- same two in the email. They are already in the block she wrote from, so the
-- question is only where they are read back from.
--
-- Snapshotted onto the row when she sends, rather than recomputed wherever
-- they are shown. Three reasons, in order:
--
--   · they must agree with the recap. A member who logs a forgotten hour for
--     that month next week would otherwise see a card whose numbers contradict
--     the paragraph underneath it.
--   · the card is on Piazza, which is already six queries deep; the email is
--     sent with the service role after the request has gone.
--   · what Nina wrote from is a fact about that recap, and worth keeping.
--
-- Nullable, because a recap saved before this column existed has no snapshot,
-- and every reader falls back to wording without figures rather than to a zero.

alter table public.monthly_recaps
  add column stats jsonb;

comment on column public.monthly_recaps.stats is
  'Frozen at send: {trackedHours, reclaimedHours, actionsDone}. What the card and email quote, so they can never disagree with the recap they announce.';
