-- aOS Reporting — what the calls turned into (§5.6).
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Nina, 16 November, after clicking through the demo: "Leads & Conversions:
-- what the calls turned into. After calls booked and calls held, add calls
-- converted and what they bought (by offer, with revenue). Show it visually:
-- a funnel (leads → calls booked → held → won) and a breakdown of wins by
-- offer." Dom's three changes of the same day are in it: a bespoke line, the
-- close rate following calls converted, and "value" rather than "revenue".
--
-- Five new rows and a renumbering. The seed migration beside this one has
-- been regenerated from the brief, which is what a fresh database gets; this
-- is what an existing one needs. Running it twice changes nothing.
--
-- **Calls converted is not New clients renamed.** New clients counts
-- everybody who started this month however they arrived — a renewal from a
-- waitlist, somebody who bought from a sales page and never had a call.
-- Calls converted counts the calls that ended in a sale, which is the
-- funnel's last step and what the breakdown's rows add up to. Both are core
-- because both are figures somebody can answer, and the funnel is wrong
-- without the second one.
--
-- **Close rate now follows calls converted** (Dom, 16 November): converted ÷
-- held wherever a converted figure exists, new clients ÷ held where it does
-- not. The funnel's last step and the close rate sit on the same page, and
-- measuring them against two different numerators is the kind of
-- disagreement a client notices and nobody can explain.
--
--   **Nothing already sent changes — and it is the DATA that guarantees it,
--   not the freeze.** Said plainly because the obvious answer is wrong:
--   the carried snapshot deliberately holds only what comes from OTHER
--   months (`carried.ts` says so in as many words), since this month's own
--   figures are held still by the published-month lock instead. A calc is
--   therefore worked out fresh on every read, published months included —
--   so a changed formula WOULD change a sent report, if the inputs it
--   newly reads could appear on a month that has gone out.
--
--   They cannot appear by accident. Every month published before today
--   holds no converted figure, because the metric did not exist, so every
--   one of them falls to the new-clients branch and prints exactly what it
--   printed yesterday. For that to stop being true somebody has to put a
--   converted figure into a published month, and: the entry screen is a
--   disabled fieldset on a locked month, and `report_values` is guarded
--   `before insert or update or delete` by
--   `guard_report_published_month()`.
--
--   **That guard passes an admin**, on purpose — she is the only person
--   who can unpublish, and locking her out would be a trap (7 October).
--   So the real route is hers and it is explicit: unpublish, enter, and
--   republish, which emails the client to say the month changed. There is
--   no quiet path.
--
-- **The two per-offer rows are the only place in section 5 where a
-- category's figures hang off another section's rows.** `entity_type =
-- 'offer'` is what `guard_report_value_metric` checks, so without it the
-- first save would be refused — and with the wrong value it would store one
-- figure per month and quietly add four offers together.
--
-- **And the two bespoke rows have no entity on purpose.** Nina's
-- agency-style clients sell a great deal of work priced per job: no offer
-- row, no price, so neither the count nor its value can be derived and both
-- are typed. They belong to the month, and they count in the breakdown's
-- totals exactly as an offer's row does.
--
-- An offer's own value is worked out, never typed: sales × the offer's
-- price. A published month keeps the price it was sent with because the
-- carried snapshot freezes it (decision 7, 11 November), which is why there
-- is no second captured price here the way Funnels needed one. It is
-- labelled **value**, not revenue, because it is what was won at list
-- price rather than what came in — Financials is the section that answers
-- the second question, and the breakdown card says so under the table.

-- **Make room before renumbering, because sort_order is unique per
-- category.** `report_metrics_category_sort_order_key` is checked row by
-- row, so an upsert that puts Calls converted at 8 while New clients is
-- still sitting at 8 is refused outright — which is what happened on the
-- first attempt against live, atomically and with nothing applied.
--
-- Moving the rows that have to shift out to 108+ first leaves 8–18 empty
-- for the insert below. Rows 1–7 do not move and are not touched. It stays
-- idempotent: run again from the finished state and these same rows go to
-- 108+ and come straight back.
update public.report_metrics
   set sort_order = sort_order + 100
 where category = 'leads_conversions'
   and sort_order >= 8;

insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('leads_conversions_calls_converted', 'leads_conversions',
   'Calls converted', 'core', 'count', 'up', null, null, 8),
  ('leads_conversions_new_clients', 'leads_conversions',
   'New clients', 'core', 'count', 'up', null, null, 9),
  ('leads_conversions_total_leads', 'leads_conversions',
   'Total leads', 'calc', 'count', 'up', null, 'Sum of all sources', 10),
  ('leads_conversions_lead_source_split', 'leads_conversions',
   'Lead source split', 'calc', 'percent', 'none', null, 'Each source ÷ total leads', 11),
  ('leads_conversions_call_show_up_rate', 'leads_conversions',
   'Call show-up rate', 'calc', 'percent', 'up', null, 'Calls held ÷ calls booked', 12),
  ('leads_conversions_close_rate', 'leads_conversions',
   'Close rate', 'calc', 'percent', 'up', null,
   'Calls converted ÷ calls held, or new clients where no converted figure was entered', 13),
  ('leads_conversions_lead_to_client_rate', 'leads_conversions',
   'Lead to client rate', 'calc', 'percent', 'up', null, 'New clients ÷ total leads', 14),
  ('leads_conversions_sales_from_calls', 'leads_conversions',
   'Sales from calls', 'optional', 'count', 'up', 'offer', null, 15),
  ('leads_conversions_value_of_sales_from_calls', 'leads_conversions',
   'Value of sales from calls', 'calc', 'currency', 'up', 'offer',
   'Sales from calls × the offer''s price', 16),
  ('leads_conversions_bespoke_sales_from_calls', 'leads_conversions',
   'Bespoke sales from calls', 'optional', 'count', 'up', null, null, 17),
  ('leads_conversions_value_of_bespoke_sales_from_calls', 'leads_conversions',
   'Value of bespoke sales from calls', 'optional', 'currency', 'up', null, null, 18)
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  input_type = excluded.input_type,
  unit = excluded.unit,
  good_direction = excluded.good_direction,
  entity_type = excluded.entity_type,
  formula = excluded.formula,
  sort_order = excluded.sort_order;
