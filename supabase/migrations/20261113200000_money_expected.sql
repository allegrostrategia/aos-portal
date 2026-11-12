-- aOS Reporting — the forecast reaches the report.
--
-- NOT YET APPLIED TO LIVE.
--
-- "What you expect" has been a grid on the entry screen since 13
-- November and appeared nowhere else, so a figure somebody typed went
-- into the database and was never shown back to them. This makes it a
-- metric like any other: a card beside Revenue, a line on the year
-- chart, and a row in the history every other figure already has.
--
-- **Pulled**, because it is the forecast grid's total for the month and
-- there is no second place to type it. `report_values` refuses to store
-- a figure for a pulled metric, which is what stops one appearing.
--
-- Last in the sort order because it was added last: nothing renumbers,
-- and which figures are cards is decided per category in `trends.ts`
-- rather than by this column.

insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('financials_money_expected', 'financials', 'Money expected', 'pulled', 'currency',
   'up', null, 'The forecast grid''s total for this month', 15)
on conflict (key) do update
   set label = excluded.label,
       input_type = excluded.input_type,
       unit = excluded.unit,
       good_direction = excluded.good_direction,
       formula = excluded.formula,
       sort_order = excluded.sort_order;
