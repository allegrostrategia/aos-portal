-- aOS Reporting — which offer "potential revenue" multiplies by.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying, as every
-- migration is.
--
-- Nina, 3 November: Leads & Conversions should show potential revenue —
-- leads multiplied by what a sale is worth. There is nothing to multiply
-- by today.
--
-- **The first draft of this migration added a typed number per client.
-- Dom rejected it on 4 November, and he was right**: an offer already
-- carries a real price (`report_entities.price`, §5.9, shown on the
-- Offers page), so a second number typed somewhere else is a copy of a
-- price, and a copy of a price drifts. The day the offer goes from £400
-- to £500, Offers says £500 and Leads & Conversions goes on quietly
-- saying £400 — with nothing on either screen to say they disagree.
--
-- So this column holds a CHOICE, not a price: which of the client's
-- offers a lead is a lead for. The arithmetic then reads
-- `report_entities.price` and there is exactly one price in the system.
--
-- WHY A CHOICE IS STILL NEEDED
--   A client has several offers and nothing in the data says which one
--   the leads are for. Picking "the dearest" or "the one that sold most
--   this month" would be a guess that changes by itself, month to month,
--   with no one deciding anything. One pointer, set once, visible on the
--   settings screen and named on the report beside the figure.
--
-- NULL IS THE HONEST DEFAULT
--   Null means the figure is not drawn at all, rather than drawn as zero.
--   A potential revenue of £0 is a statement about the business; a
--   missing choice is a statement about the setup. The same goes for an
--   offer whose own price is blank: no price, no figure, no £0.

alter table public.report_workspaces
  add column potential_revenue_offer_id uuid
    references public.report_entities (id) on delete set null;

comment on column public.report_workspaces.potential_revenue_offer_id is
  'Which offer the potential revenue figure on Leads & Conversions multiplies leads by. The price itself lives on the offer (report_entities.price) so the two screens can never disagree; null, or an offer with no price, means the figure is not shown (Nina 3 Nov 2026, as revised by Dom 4 Nov 2026).';

-- `on delete set null` RATHER THAN `restrict`
--   Restrict is what `report_values` and `report_targets` use, because
--   losing a figure loses a record. This loses a preference. More to the
--   point, `report_entities` cascades FROM `report_workspaces`: a restrict
--   here would make a workspace point at a row that its own deletion
--   removes, which is the one way this column could ever block deleting a
--   client. Nothing in the app deletes an entity in any case — retiring is
--   `active = false` (7 Oct).

-- A foreign key can say "some entity". Only this can say which: the
-- client's own, and an offer rather than a funnel, a campaign or a social
-- platform. Without it, a workspace can point at another client's offer
-- and multiply their leads by somebody else's price.
create or replace function public.guard_report_workspace_potential_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_entity_type;
  v_workspace uuid;
begin
  if new.potential_revenue_offer_id is null then
    return new;
  end if;

  select entity_type, workspace_id into v_type, v_workspace
  from public.report_entities where id = new.potential_revenue_offer_id;

  if v_type is distinct from 'offer' then
    raise exception 'Potential revenue can only be based on an offer';
  end if;

  if v_workspace is distinct from new.id then
    raise exception 'Potential revenue can only be based on this business''s own offer';
  end if;

  return new;
end;
$$;

comment on function public.guard_report_workspace_potential_offer() is
  'The offer behind potential revenue has to be an offer, and has to belong to this workspace (4 Nov 2026).';

-- **No `is_portal_admin()` in this guard, on purpose.** It is not a rule
-- about who may write - a member sets this on their own settings screen,
-- and `guard_report_workspace_admin_fields` already decides who may
-- change what. It is a rule about what the value may be, so it applies to
-- everybody, the service role included.
create trigger report_workspaces_guard_potential_offer
  before insert or update on public.report_workspaces
  for each row
  execute function public.guard_report_workspace_potential_offer();
