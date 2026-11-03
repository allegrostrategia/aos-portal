-- aOS Reporting — the price behind "potential revenue" on Leads & Conversions.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying, as every
-- migration is.
--
-- Nina, 3 November: Leads & Conversions should show potential revenue —
-- leads multiplied by the product's price. There is nothing to multiply
-- by today, and the four ways to supply one were put to Dom on the same
-- day. He chose a typed number per client, for the reason that decides
-- it: the figure exists for a client who has leads and has not sold
-- anything yet, and every derived price is a dash or a lie for exactly
-- that client. A month's average sale value moves every month for
-- reasons that have nothing to do with leads.
--
-- **An offer already has a real price** (`report_entities.price`, §5.9),
-- which is what makes this one column rather than a feature. The reason
-- it is not read here is that a client has several offers and nothing
-- says which one a lead is a lead FOR. When something does — a main-offer
-- flag, which is Nina's later work — this column becomes a default that
-- a chosen offer overrides, and nothing else changes: the arithmetic is
-- in one place and reads one number.
--
-- Null is the honest default and means the figure is not drawn at all,
-- rather than drawn as zero. A potential revenue of £0 is a statement
-- about the business; a missing price is a statement about the setup.

alter table public.report_workspaces
  add column potential_revenue_price numeric;

comment on column public.report_workspaces.potential_revenue_price is
  'What one sale is worth, for the potential revenue figure on Leads & Conversions. Typed by the team on the reporting settings screen; null means the figure is not shown. Not a price list - the client''s offers carry their own prices in report_entities.price.';

-- A price of zero multiplies every lead into nothing and reads as a bug;
-- a negative one is not a price. Both are refused here rather than
-- defended against on the screen, because the screen is not the only way
-- in: the CSV importer, a fix by hand and a future admin tool all land
-- in this column.
alter table public.report_workspaces
  add constraint report_workspaces_potential_price_positive
  check (potential_revenue_price is null or potential_revenue_price > 0);
