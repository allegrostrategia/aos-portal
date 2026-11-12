-- aOS Reporting — an offer's revenue is money received, in one place.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Nina's decision, through Dom on 13 November. Two screens have been
-- answering "what did this offer earn": the Offers screen, typed per
-- offer, and the Actual grid, where every pound that came in is already
-- entered. **Financials is money received**, so the Actual grid wins:
-- an offer sold in September and paid in October earns in October, and
-- the margin and the effective hourly rate on the Offers page move with
-- it. That is the point of the change rather than a side effect of it.
--
-- `pulled` is what takes the box off the Offers screen: the entry form
-- renders the core and optional metrics, and `report_values` refuses to
-- store a figure for a pulled one at all. The screen asks for three
-- numbers a month now — units sold, hours, other direct costs — and
-- shows the money received beside them so the margin has a visible
-- source.
--
-- **Two rows on live hold a typed one** (Test Client, 1:1 Coaching:
-- August £2,000 and September £3,000). They are NOT migrated — Dom's
-- call, 13 November. Nothing in aOS is deleted, so they stay exactly
-- where they are and nothing reads them. On a real client the same
-- money would be entered as a Financials row linked to that offer,
-- which is where it was always going to be typed anyway.

update public.report_metrics
   set input_type = 'pulled',
       formula = 'Money received on the Financials rows linked to this offer'
 where key = 'offers_revenue_this_month';
