-- aOS — the hot seat questions, replaced (round 4, item 12).
--
-- The three original questions are gone from the form, replaced by a new
-- set of four, confirmed wording:
--   1. What is making you feel stuck at the moment?            -> challenge
--   2. What is taking up a lot of your time at the moment?     -> time_sink
--   3. What are you doing right now that you don't think you
--      should be doing, or that someone else could do instead,
--      that you don't enjoy?                                   -> should_stop
--   4. Based on this, what would you like your hot seat to
--      focus on?                                               -> reflection
--
-- 1 keeps the `challenge` column: it asks the same thing in different words,
-- and the prep sheet, Piazza and the confirmation all read it. 4 is the
-- yellow box from round 3, relabelled. `already_tried` and `done_looks_like`
-- are retired: not written by the form any more, kept for every submission
-- that already has them, shown on the prep sheet where present.

alter table public.hot_seat_submissions
  add column time_sink text,
  add column should_stop text;

comment on column public.hot_seat_submissions.challenge is
  'Q1: what is making them feel stuck at the moment. In their own words.';
comment on column public.hot_seat_submissions.time_sink is
  'Q2: what is taking up a lot of their time at the moment.';
comment on column public.hot_seat_submissions.should_stop is
  'Q3: what they are doing that they should not be, or that someone else could do, that they do not enjoy.';
comment on column public.hot_seat_submissions.reflection is
  'Q4: what they would like the hot seat to focus on, based on the above. See reflection_unsure.';
comment on column public.hot_seat_submissions.already_tried is
  'Retired 18 Sep 2026 (round 4). Kept for submissions that have it; the form no longer asks.';
comment on column public.hot_seat_submissions.done_looks_like is
  'Retired 18 Sep 2026 (round 4). Kept for submissions that have it; the form no longer asks.';
