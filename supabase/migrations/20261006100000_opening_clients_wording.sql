-- aOS Reporting — the opening figure's own description.
--
-- NOT YET APPLIED. Shown to Dom first, per §13.
--
-- Two words of it were wrong. `report_metrics.formula` is "the brief's own
-- words for how a field is worked out", and the text written on 5 October
-- said the figure is typed "for your first month only". That was true of
-- the plan and not of what was built: the box appears on the month holding
-- the figure in use, which is the first month until somebody sets one
-- earlier or later, and on a month holding a stray so it can be cleared.
--
-- Worth correcting even though **no screen renders it**: the entry form
-- shows `formula` under a figure on the "Worked out for you" card, which
-- only lists calc and pulled metrics. For a core metric like this one it is
-- documentation in the database and nothing else — read by whoever opens
-- the table next, and misleading them is the whole cost here.

update public.report_metrics
   set formula = 'Typed once, on the month it belongs to, and carried forward from there.'
 where key = 'client_experience_clients_at_start_opening';
