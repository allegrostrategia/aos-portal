-- aOS Reporting — a figure set per platform (§5.2).
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Step 2 of `docs/reporting/platform-metric-sets.md`, approved by Nina on
-- 16 November. Step 1 (20261117100000) gave a platform a kind; this gives
-- the kinds something to differ about. Eighteen figures that belong to one
-- platform and not another:
--
--   LinkedIn  impressions, members reached, reactions, comments, reposts,
--             and the three rates measured against impressions
--   TikTok    video views, likes, favourites, views per post, favourite rate
--   Facebook  post engagements
--   YouTube   watch time, its reported click-through rate, average view
--             duration, watch time per view
--
-- **Nothing existing moves.** The seed migration beside this one has been
-- regenerated from the brief and `PLATFORM_SET_METRICS`, which is what a
-- fresh database gets; this is what an existing one needs. The new rows
-- take sort_order 23 to 40, after everything already there, so there is no
-- renumbering — `report_metrics_category_sort_order_key` is checked row by
-- row, which made the last renumbering a migration live refused
-- atomically (16 November). Running this twice changes nothing.
--
-- **Which kinds each figure belongs to is NOT in here.** It is in
-- `src/lib/reporting/platform-metrics.ts`, for the same reason
-- `OFFER_HOURS_METRICS` lives in code: the database's job is that a figure
-- exists and has a unit, and "which boxes this screen asks for" is a
-- product decision that changes with a screen rather than with a schema.
-- A figure is stored per platform either way (`entity_type =
-- 'social_platform'`), so no row needs to know the kind to be saved.
--
-- **A published report cannot change because a kind changed.** Two halves,
-- and only the first is obvious:
--
--   · The typed figures are safe by construction. Every report screen
--     drops a metric whose figure is null, and `buildYearRows` drops a row
--     that is blank all year — so a month shows what it HOLDS, never what
--     a metric list says it could hold. The kind narrows what a screen
--     ASKS for, and the predicate in platform-metrics.ts is "this kind's
--     set, plus anything this month already holds", so a stored figure can
--     never go un-shown or un-editable.
--
--   · The calcs are not, and needed a change: engagement rate, the
--     click-through rate and views per post are worked out from DIFFERENT
--     figures depending on the kind — LinkedIn measures engagement
--     against impressions, Facebook against reach — and a calc is
--     recomputed on every read, published months included (the carried
--     snapshot deliberately holds only what comes from other months). So
--     the kind is frozen into that snapshot beside the offer price and the
--     row names, with absent ≠ null, which is how a month published before
--     today goes on reading the live one.
--
-- Deliberately NOT a lock on the kind once a month is published: that
-- would trap a client who picked "Other" by mistake, and freeze every
-- future month's figure set to protect a past one (Dom asked for one or
-- the other on 17 November; this is the other).
--
-- **Two click-through rates, on purpose.** Nina settled on 16 November
-- that YouTube's CTR and average view duration are typed, because YouTube
-- Studio hands them to you — while LinkedIn's and Facebook's are worked
-- out from clicks and impressions. `input_type` is a column on the metric,
-- not on the kind, and `guard_report_value_metric` refuses a stored value
-- for a `calc` row, so one key could not be both: it would be unstorable
-- on the platform that reports it, or uncomputable on the ones that do
-- not. Hence `social_media_reported_click_through_rate` beside
-- `social_media_click_through_rate` — one on-screen label, never both on
-- the same screen, the kind decides which.
--
-- **And no new unit.** Average view duration and watch time per view are
-- minutes, and wear `ratio`: the one unit that already means "one decimal,
-- no symbol, averaged over the year rather than summed", which is what a
-- per-view average needs. `alter type report_unit add value 'minutes'`
-- could not be used by an insert in the same transaction anyway.

insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('social_media_impressions', 'social_media',
   'Impressions', 'core', 'count', 'up', 'social_platform', null, 23),
  ('social_media_members_reached', 'social_media',
   'Members reached', 'core', 'count', 'up', 'social_platform', null, 24),
  ('social_media_reactions', 'social_media',
   'Reactions', 'core', 'count', 'up', 'social_platform', null, 25),
  ('social_media_comments', 'social_media',
   'Comments', 'core', 'count', 'up', 'social_platform', null, 26),
  ('social_media_reposts', 'social_media',
   'Reposts', 'core', 'count', 'up', 'social_platform', null, 27),
  ('social_media_impressions_per_post', 'social_media',
   'Impressions per post', 'calc', 'count', 'up', 'social_platform',
   'Impressions ÷ posts published', 28),
  ('social_media_click_through_rate', 'social_media',
   'Click-through rate', 'calc', 'percent', 'up', 'social_platform',
   'Link clicks ÷ impressions, or ÷ reach on Facebook', 29),
  ('social_media_profile_view_rate', 'social_media',
   'Profile view rate', 'calc', 'percent', 'up', 'social_platform',
   'Profile views ÷ impressions, or ÷ video views on TikTok and ÷ reach on Facebook', 30),
  ('social_media_video_views', 'social_media',
   'Video views', 'core', 'count', 'up', 'social_platform', null, 31),
  ('social_media_likes', 'social_media',
   'Likes', 'core', 'count', 'up', 'social_platform', null, 32),
  ('social_media_favourites', 'social_media',
   'Favourites', 'core', 'count', 'up', 'social_platform', null, 33),
  ('social_media_views_per_post', 'social_media',
   'Views per post', 'calc', 'count', 'up', 'social_platform',
   'Video views ÷ posts published, or views ÷ videos published on YouTube', 34),
  ('social_media_favourite_rate', 'social_media',
   'Favourite rate', 'calc', 'percent', 'up', 'social_platform',
   'Favourites ÷ video views', 35),
  ('social_media_post_engagements', 'social_media',
   'Post engagements', 'core', 'count', 'up', 'social_platform', null, 36),
  ('social_media_watch_time', 'social_media',
   'Watch time (hours)', 'core', 'hours', 'up', 'social_platform', null, 37),
  ('social_media_reported_click_through_rate', 'social_media',
   'Click-through rate (reported)', 'core', 'percent', 'up', 'social_platform', null, 38),
  ('social_media_average_view_duration', 'social_media',
   'Average view duration (minutes)', 'core', 'ratio', 'up', 'social_platform', null, 39),
  ('social_media_watch_time_per_view', 'social_media',
   'Watch time per view (minutes)', 'calc', 'ratio', 'up', 'social_platform',
   'Watch time × 60 ÷ views', 40)
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  input_type = excluded.input_type,
  unit = excluded.unit,
  good_direction = excluded.good_direction,
  entity_type = excluded.entity_type,
  formula = excluded.formula,
  sort_order = excluded.sort_order;
