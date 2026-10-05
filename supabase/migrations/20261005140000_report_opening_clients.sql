-- aOS Reporting — §5.8's opening figure.
--
-- "Active clients at start" is PULLED from last month's "active at end",
-- which has nothing behind it in a client's first month: report_values
-- refuses to store a value for a pulled metric (guard_report_value_metric),
-- so it cannot simply be typed. Every figure downstream — retention, churn,
-- upsell and active at end — is null for that month and stays null.
--
-- A separate opening figure, typed once (Nina via Dom, 5 October 2026).
-- Approved as shown before it was applied, per §13.
--
-- The resolution rule is in src/lib/reporting/client-flow.ts, not here:
-- the EARLIEST stored opening figure wins, and every later month carries on
-- from the month before. Earliest stored rather than the workspace's first
-- month, so moving that boundary cannot silently blank the chain. A second
-- one is shown on the entry screen as not in use rather than ignored.

-- NOTE on the approved SQL: the plan Nina and Dom approved named a `note`
-- column. The column is called `formula` — "the brief's own words for how a
-- field is worked out", shown under the box on the entry page. Nothing else
-- is changed: same metric, same type, same text, same position.
insert into public.report_metrics
  (key, category, label, input_type, unit, good_direction, entity_type, formula, sort_order)
values
  ('client_experience_clients_at_start_opening', 'client_experience',
   'Clients at the start, when you joined', 'core', 'count', 'none', null,
   'Typed once, for your first month only. Every month after it carries on from the month before.',
   0);
