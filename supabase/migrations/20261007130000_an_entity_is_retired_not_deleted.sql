-- =============================================================================
-- An offer is retired, never deleted. NOT APPROVED — do not apply.
-- =============================================================================
--
-- Decision 4 of the freeze plan, approved by Dom on 7 October.
--
-- `report_values.entity_id` and `report_targets.entity_id` are both
-- `on delete cascade`. So deleting one offer deletes every figure ever
-- recorded against it — every month, published ones included — and the
-- client's report quietly loses a row it has already been shown.
--
-- That is rule 7 inverted: "cancelling revokes access and keeps every record
-- intact". It is also not something a snapshot can fix. Freezing a published
-- month would keep the row the client reads while the record behind it was
-- gone, which is worse than either.
--
-- Nothing in the app deletes an entity today — `offer-actions`,
-- `campaign-actions` and `funnel-actions` have no delete between them, and
-- "Retire this campaign" sets `active = false`. So this guards the path that
-- is actually open: somebody doing it by hand in the SQL editor, once, in a
-- hurry. Which is exactly how it would happen.
--
-- `restrict` RATHER THAN `set null`
--   `set null` would orphan the figures: a row of numbers belonging to no
--   offer, which no screen can draw and nobody can match up again. Refusing
--   the delete keeps the question where it belongs — with the person who
--   wanted the offer gone, who wanted it off the screens, which is what
--   retiring does.
--
-- IT DOES NOT BLOCK DELETING A WORKSPACE
--   The obvious risk, checked before asking for this: `report_entities`
--   cascades from `report_workspaces`, so a restrict here could have made a
--   workspace undeletable. It does not. Postgres removes the referencing
--   `report_values` rows in the same statement as the entities, so the
--   constraint never fires. Verified in the harness; both cases are now in
--   `published-months.test.mjs`.
--
-- WHAT THE EDITOR SEES
--   Nobody meets this through the UI, because the UI has no delete. If a
--   delete is ever added, `deleteEntityMessage` in `src/lib/reporting/
--   entity-delete.ts` is the sentence to show: it names the constraint by
--   error code rather than matching on wording, and says to retire instead.

alter table public.report_values
  drop constraint report_values_entity_id_fkey,
  add constraint report_values_entity_id_fkey
    foreign key (entity_id) references public.report_entities (id)
    on delete restrict;

alter table public.report_targets
  drop constraint report_targets_entity_id_fkey,
  add constraint report_targets_entity_id_fkey
    foreign key (entity_id) references public.report_entities (id)
    on delete restrict;

comment on constraint report_values_entity_id_fkey on public.report_values is
  'Restrict, not cascade: deleting an offer would take its figures off months the client has already read (rule 7). Retire it instead (Dom, 7 Oct 2026).';

comment on constraint report_targets_entity_id_fkey on public.report_targets is
  'Restrict, not cascade. Same reason as report_values: a target belongs to the record, not to the row being tidied away.';
