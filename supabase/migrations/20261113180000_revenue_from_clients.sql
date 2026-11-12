-- aOS Reporting — "Other income" is "Revenue from clients".
--
-- Dom, 13 November, reading the screen: the split by row kind is right,
-- and the label on the second half is wrong. **Retainer clients are an
-- agency's main revenue, not an afterthought**, and a figure calling
-- them "other" says the opposite of what the business is.
--
-- The key stays `financials_other_income`. Four tables carry
-- `metric_key` as a foreign key with no cascade —`report_values`,
-- `report_targets`, `report_benchmarks` and `report_launch_values` — so
-- renaming it is a three-step data migration for a name that appears on
-- no screen. `scripts/generate-report-metrics-seed.mjs` holds the
-- override that keeps the brief's new label pointing at the old key, and
-- says this there too.

update public.report_metrics
   set label = 'Revenue from clients'
 where key = 'financials_other_income';

update public.report_metrics
   set formula = 'Revenue from offers + revenue from clients'
 where key = 'financials_total_revenue';
