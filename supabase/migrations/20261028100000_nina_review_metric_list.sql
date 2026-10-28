-- aOS Reporting — the metric list after Nina's review.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Three of her answers of 28 October are rows in `report_metrics` rather
-- than code, so a database seeded on 30 September still holds the old
-- ones. The seed migration beside this one has been regenerated from the
-- brief, which is what a fresh database gets; this is what an existing
-- one needs. Running it twice changes nothing.
--
-- **Decision 28 — four core fields become optional.** Every core field
-- must be filled before a section counts as finished, so the orange
-- marker is only worth trusting if each one is a number somebody would
-- actually chase. These four are not: two are hours nobody logs reliably,
-- one is per-campaign revenue Meta does not attribute, and cash in bank
-- is a figure a client may not want in a monthly report at all. Nothing
-- is deleted or hidden — an optional field still has its box, still
-- stores, and still shows on the report. It stops holding a section
-- orange.
--
-- **Decision 2 — "Total hours spent delivering" is never judged.** Hours
-- going up can be a worse month or a bigger one, and nothing in the
-- report can tell which, so it reports the figure and its change and says
-- nothing about whether that is good news. `good_direction = 'none'` is
-- what switches off all three places a judgement would appear: the
-- coloured arrow on the card (`changeTone`), the traffic light
-- (`trafficLight` returns null), and the panel sentence (`highlightFor`
-- returns null). One column, three screens, which is why it is a column.
--
-- **Decision 20 — conversion is against sign-ups.** Only the text changes
-- here; the arithmetic lives in `launch-figures.ts` and has changed with
-- it. `formula` is documentation in the database, read by whoever opens
-- the table next, and a formula that describes the old reading is worse
-- than none.

update public.report_metrics
   set input_type = 'optional'
 where key in (
   'trial_reels_hours_spent_on_trial_reels',
   'offers_hours_spent_delivering',
   'ads_revenue_from_ads',
   'financials_cash_in_bank_at_month_end'
 );

update public.report_metrics
   set good_direction = 'none'
 where key = 'offers_total_hours_spent_delivering';

update public.report_metrics
   set formula = 'Total sales ÷ sign-ups to the main selling stage'
 where key = 'launches_conversion_rate';
