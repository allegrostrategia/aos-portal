-- aOS Reporting — Financials' revenue comes from the two grids.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Three rows of `report_metrics`, because the seed migration beside this
-- one is what a fresh database gets and this is what an existing one
-- needs. Running it twice changes nothing.
--
-- **Other income becomes pulled.** From 13 November the Actual grid is
-- every pound that came in: a row name and an amount, typed off the bank
-- and Stripe. A typed "Other income" box beside it is the same money
-- asked for twice, and Total revenue would count it twice. So the two
-- halves are read off the grid instead — Revenue from offers is what came
-- in on the rows called offers, Other income is what came in on the
-- client rows, which in an agency like Nina's is most of the money — and
-- together they are the month.
--
-- **The split is the row's kind, not its offer link.** Linking a row to
-- an offer is optional and plenty of clients never do it; splitting on
-- the link put a month's whole programme revenue under "Other income",
-- which is a label saying something untrue. The link still decides the
-- Offers donut, which is a chart about offer entities.
--
-- `pulled` is what takes the box off the screen: the entry form renders
-- the core and optional metrics, and `report_values` refuses to store a
-- figure for a pulled one at all.
--
-- **Two rows on live hold a typed `financials_other_income`** (Test
-- Client, two months). They are left exactly where they are — nothing in
-- aOS is deleted — but nothing reads them any more, so that money belongs
-- on the Actual grid as a row. Named here because a figure that silently
-- stops counting is the kind of thing nobody notices for a month.
--
-- **MRR and the two formulas** are documentation in the database, read by
-- whoever opens the table next. MRR was "the revenue on offers marked
-- recurring", which left every retainer client out of it; it is the money
-- received this month on cells that recur, each cell carrying its own copy
-- of the setting.

update public.report_metrics
   set input_type = 'pulled',
       formula = 'Money received on client rows'
 where key = 'financials_other_income';

update public.report_metrics
   set formula = 'Money received on offer rows'
 where key = 'financials_revenue_from_offers';

update public.report_metrics
   set formula = 'Money received this month on cells that recur'
 where key = 'financials_monthly_recurring_revenue';
