-- A LinkedIn post cannot be a Reel (§5.2, step 3)
--
-- `report_post_type` was written on 11 November with Instagram's six, at
-- a time when there was one Social Media list and it was Instagram's.
-- Nina's per-platform lists of 16 November need five words it has never
-- had: LinkedIn has text posts, polls and articles, Facebook has links,
-- and TikTok and YouTube both have live.
--
-- **Nothing is removed and nothing is renamed.** Postgres cannot drop a
-- value from an enum anyway, but the rule holds regardless: a post typed
-- `story` on a platform that no longer offers Story keeps saying Story
-- (rule 7), and the picker keeps showing it — `postTypesFor` adds back
-- whatever the three posts on screen already are, because a <select>
-- with no option matching its value silently renders as the first one,
-- and a kind corrected would otherwise retype three posts the moment
-- somebody pressed Save.
--
-- **Only five of Nina's words are new.** The rest are the same shape of
-- post under a different name, so they are the same value, which is the
-- rule the figures already follow:
--
--   · LinkedIn's Image is `photo`; Instagram's Photo is `photo`.
--   · Document / carousel and Photo carousel are both `carousel`.
--   · A YouTube Short and an Instagram Reel are both `reel` — the same
--     vertical short video under two companies' words. TikTok's is
--     called just "Video" and is its only one, so that one is `video`.
--   · A YouTube Long-form is `video`.
--
-- Which is what makes a kind safe to correct: the client who chose
-- "Other", put their Reels in and then said Instagram does not come back
-- to three posts typed as nothing.
--
-- **This file adds values and uses none of them**, on purpose. A
-- migration runs in one transaction here (the test harness runs each
-- file with a single `exec`), and Postgres refuses to use an enum value
-- added in the transaction that added it — "unsafe use of new value".
-- Anything that needs to WRITE one of these belongs in a later file.
--
-- `if not exists` so a re-run is a no-op rather than an error, which is
-- the only way an enum change can be made idempotent.

alter type public.report_post_type add value if not exists 'text';
alter type public.report_post_type add value if not exists 'link';
alter type public.report_post_type add value if not exists 'poll';
alter type public.report_post_type add value if not exists 'article';
alter type public.report_post_type add value if not exists 'live';

comment on type public.report_post_type is
  'Every kind of post that can be stored. Which ones a given platform is '
  'OFFERED is in src/lib/reporting/platform-post-types.ts, not here: this '
  'is the constraint on the data, that is the question put to a person. '
  'A kind of post that means the same thing on two platforms is one value '
  'with two labels — a LinkedIn Image is a photo, a YouTube Short is a '
  'reel — so correcting a platform''s kind never retypes its posts.';
