"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";

/**
 * Offers: their setup, and their monthly figures.
 *
 * Offers are the one Stage 2 category whose figures are per-row rather than
 * per-month (§5.9: "repeatable: one block per offer"), so they need their own
 * actions — the generic save writes one figure per metric per month, which
 * for an offer would silently merge four offers into one.
 */

export type OfferState = { error?: string; notice?: string } | null;

/** Monthly fields are named `v:<metric key>:<offer id>`. */
const FIELD = /^v:([a-z0-9_]+):([0-9a-f-]{36})$/;

/** The four figures typed against an offer each month (§5.9). */
const OFFER_METRICS = new Set([
  "offers_units_sold",
  "offers_revenue_this_month",
  "offers_hours_spent_delivering",
  "offers_other_direct_costs",
]);

async function editableWorkspace(workspaceId: string) {
  const reportUser = await requireReportUser();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." } as const;

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });

  if (!mayEdit) {
    return { error: "Your report is filled in by your strategist." } as const;
  }
  return { reportUser, workspace } as const;
}

/**
 * Create an offer, or change its setup.
 *
 * Setup is "name, price, type (one-off or recurring), hourly cost of the
 * client's own delivery time" (§5.9) — set once, not re-entered each month,
 * which is why it lives on the entity and not in report_values.
 */
export async function saveOffer(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("offer_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const price = fromInputValue(String(formData.get("price") ?? ""));
  const hourlyCost = fromInputValue(String(formData.get("hourly_cost") ?? ""));
  const pricingModel = String(formData.get("pricing_model") ?? "one_off");

  if (!name) return { error: "An offer needs a name." };
  if (pricingModel !== "one_off" && pricingModel !== "recurring") {
    return { error: "An offer is either one-off or recurring." };
  }
  if (price !== null && price < 0) return { error: "A price cannot be negative." };
  if (hourlyCost !== null && hourlyCost < 0) {
    return { error: "An hourly cost cannot be negative." };
  }

  const supabase = await createClient();
  const fields = {
    workspace_id: workspaceId,
    entity_type: "offer" as const,
    name,
    price,
    pricing_model: pricingModel,
    hourly_cost: hourlyCost,
  };

  const { error } = id
    ? await supabase.from("report_entities").update(fields).eq("id", id)
    : await supabase.from("report_entities").insert(fields);

  if (error) {
    // The workspace + type + name unique rule is the likely one, and the
    // database's own wording would not tell anybody what to do about it.
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already an offer called "${name}".` };
    }
    return { error: `Couldn't save the offer: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: id ? `${name} updated.` : `${name} added.` };
}

/**
 * Retire an offer.
 *
 * `active = false`, never a delete (rule 7). Last year's months keep the
 * offer their figures belong to, and a retired offer stops appearing on the
 * entry screen for new months.
 */
export async function retireOffer(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("offer_id") ?? "").trim();
  if (!id) return { error: "Which offer?" };

  const supabase = await createClient();
  const restore = String(formData.get("restore") ?? "") === "1";
  const { error } = await supabase
    .from("report_entities")
    .update({ active: restore })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return { error: `Couldn't update the offer: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return { notice: restore ? "Back in use." : "Retired. Its past months are untouched." };
}

/**
 * This month's figures for every offer, in one save.
 *
 * One form rather than one per offer: somebody entering a month is reading
 * down a list of four numbers per offer, and four separate saves is four
 * chances to leave one behind.
 */
export async function saveOfferMonth(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Which month?" };

  const supabase = await createClient();

  // Only offers of THIS workspace. The entity id arrives in the form body,
  // so without this an id from another client would be written against this
  // one — RLS would refuse it, but refusing it here says why.
  const { data: offers } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "offer")
    .returns<{ id: string }[]>();

  const known = new Set((offers ?? []).map((o) => o.id));

  const submitted: { key: string; entityId: string; value: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = FIELD.exec(field);
    if (!match) continue;
    const [, key, entityId] = match;
    if (!OFFER_METRICS.has(key) || !known.has(entityId)) continue;
    submitted.push({ key, entityId, value: fromInputValue(raw) });
  }

  if (submitted.length === 0) return { error: "Nothing to save." };

  const { error: periodError } = await supabase
    .from("report_periods")
    .upsert({ workspace_id: workspaceId, month }, {
      onConflict: "workspace_id,month",
      ignoreDuplicates: true,
    });
  if (periodError) return { error: `Couldn't open the month: ${periodError.message}` };

  const { data: existingRows, error: readError } = await supabase
    .from("report_values")
    .select("id, metric_key, entity_id, value")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .in("entity_id", [...known])
    .returns<
      { id: string; metric_key: string; entity_id: string; value: number | null }[]
    >();

  if (readError) return { error: `Couldn't read this month: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((r) => [`${r.metric_key}|${r.entity_id}`, r]),
  );

  const inserts = [];
  const updates = [];
  for (const s of submitted) {
    const row = existing.get(`${s.key}|${s.entityId}`);
    if (!row) {
      inserts.push({
        workspace_id: workspaceId,
        month,
        metric_key: s.key,
        entity_id: s.entityId,
        value: s.value,
        source: "manual" as const,
        entered_by: access.reportUser.id,
      });
    } else if (row.value !== s.value) {
      updates.push({
        id: row.id,
        workspace_id: workspaceId,
        month,
        metric_key: s.key,
        entity_id: s.entityId,
        value: s.value,
        source: "manual" as const,
        entered_by: access.reportUser.id,
        entered_at: new Date().toISOString(),
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("report_values").insert(inserts);
    if (error) return { error: `Couldn't save: ${error.message}` };
  }
  if (updates.length > 0) {
    const { error } = await supabase.from("report_values").upsert(updates);
    if (error) return { error: `Couldn't save: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");

  const changed = inserts.length + updates.length;
  return {
    notice: changed === 0 ? "Nothing had changed." : "Saved. Offers are up to date.",
  };
}
