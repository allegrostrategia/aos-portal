-- aOS Reporting — the four cost totals come from the expense grid.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- The other half of the move `20261113140000` started. Revenue stopped
-- being typed when the Actual grid took it; the four cost totals stop
-- being typed now the expense grid holds them. Each is the sum of its
-- bucket — Fixed, Variable, Team, Investment — over the month's expense
-- rows, and **each row keeps the bucket it was saved with**, so a
-- category moved from Fixed to Team is forward-looking rather than a
-- rewrite of the composition of every month already published.
--
-- `pulled` is what takes the four boxes off the screen: the entry form
-- renders the core and optional metrics, and `report_values` refuses to
-- store a figure for a pulled one at all. **Cash in bank at month end is
-- the one typed figure left on Financials** — it is not a cost and not
-- money in, and Runway is what reads it.
--
-- **Figures typed into those four boxes stay exactly where they are.**
-- Nothing in aOS is deleted. Nothing reads them any more either, so on a
-- month that had them the costs will read as dashes until the same money
-- goes on the grid as categories. Live holds a handful (Test Client); the
-- four are listed below so whoever runs this knows what to look for:
--
--   select month, metric_key, value from public.report_values
--    where metric_key in ('financials_fixed_costs',
--                         'financials_variable_costs',
--                         'financials_team_costs',
--                         'financials_investment_spend');
--
-- **Completion changes with this.** Those three were the only `core`
-- metrics Financials had, so "still to fill in" would say the section is
-- finished the moment it is opened. `completion.ts` counts the grids
-- instead: Financials owes a figure for the month, and a month with
-- money or costs in it is answered.

update public.report_metrics
   set input_type = 'pulled',
       formula = 'The Fixed bucket of the expense grid'
 where key = 'financials_fixed_costs';

update public.report_metrics
   set input_type = 'pulled',
       formula = 'The Variable bucket of the expense grid'
 where key = 'financials_variable_costs';

update public.report_metrics
   set input_type = 'pulled',
       formula = 'The Team bucket of the expense grid'
 where key = 'financials_team_costs';

update public.report_metrics
   set input_type = 'pulled',
       formula = 'The Investment bucket of the expense grid'
 where key = 'financials_investment_spend';
