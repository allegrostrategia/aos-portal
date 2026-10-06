-- aOS Reporting — the price a funnel's offer was selling at, that month.
--
-- NOT YET APPLIED. Shown to Dom first, per §13.
--
-- §5.5: funnel revenue is "purchases × linked offer price". Read from the
-- offer's current price, that sentence quietly rewrites history: raise a
-- price in November and October's funnel revenue changes with it, on a
-- report the client was sent in November. **A published month must never
-- change after it has been sent** (Dom, 6 October), so the price is
-- captured with the month's figures and the month keeps it.
--
-- `optional` rather than `core` for two reasons: a core metric counts
-- towards "Still to fill in" (§8.1), and this is not something anybody
-- fills in — the entry screen writes it when the month is saved, taking
-- the linked offer's price as it stands at that moment. It is filtered
-- out of the form for the same reason, the way §5.8's opening figure is.
--
-- A funnel month with no price captured, and a funnel with no linked
-- offer, both give a dash rather than a zero (§4, and Dom 5 October:
-- "a funnel with no linked offer shows revenue as a dash, not £0").
-- There are no historic funnel months anywhere — Funnels ships with this
-- — so no month loses a figure it used to have.

insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('funnels_offer_price_at_month', 'funnels',
   'Offer price that month', 'optional', 'currency', 'none', 'funnel',
   'Captured when the month is saved, from the linked offer''s price at the time. Not typed, and not changed by a later price rise.',
   16);
