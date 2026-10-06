"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";
import { decidePrice, type PriceReason } from "./funnel-price.ts";

/**
 * Funnels: their setup, their monthly figures, and their price.
 *
 * The same shape as Offers and Ads — one block per funnel, figures per
 * row — with one thing neither of those has: **a funnel's revenue depends
 * on another entity's price**, and that price moves.
 *
 * So the price is captured with the month, once, and a published month
 * never changes it. The rules are in `funnel-price.ts`, tested on their
 * own; this file is what does as it is told.
 */

export type FunnelState = { error?: string; notice?: string } | null;

const FIELD = /^v:([a-z0-9_]+):([0-9a-f-]{36})$/;
const PRICE_KEY = "funnels_offer_price_at_month";

/** The figures typed against a funnel each month (§5.5). */
const FUNNEL_METRICS = new Set([
  "funnels_landing_page_views",
  "funnels_opt_ins",
  "funnels_sales_page_views",
  "funnels_checkouts_started",
  "funnels_purchases",
  "funnels_order_bumps_taken",
  "funnels_upsells_taken",
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function isPublished(supabase: Supabase, workspaceId: string, month: string) {
  const { data } = await supabase
    .from("report_periods")
    .select("published_at")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .maybeSingle<{ published_at: string | null }>();
  return Boolean(data?.published_at);
}

async function linkedOfferPrice(supabase: Supabase, funnelId: string) {
  const { data: funnel } = await supabase
    .from("report_entities")
    .select("linked_offer_id")
    .eq("id", funnelId)
    .maybeSingle<{ linked_offer_id: string | null }>();

  if (!funnel?.linked_offer_id) return null;

  const { data: offer } = await supabase
    .from("report_entities")
    .select("price")
    .eq("id", funnel.linked_offer_id)
    .maybeSingle<{ price: number | null }>();

  return offer?.price ?? null;
}

/**
 * Apply the price rule for one funnel month.
 *
 * Returns what it did, so a caller can say so — "captured £500" is worth
 * telling somebody, and so is "left June alone".
 */
async function applyPrice(
  supabase: Supabase,
  {
    workspaceId,
    month,
    funnelId,
    reason,
    enteredBy,
  }: {
    workspaceId: string;
    month: string;
    funnelId: string;
    reason: PriceReason;
    enteredBy: string;
  },
): Promise<{ changed: boolean; error?: string }> {
  const [published, offerPrice] = await Promise.all([
    isPublished(supabase, workspaceId, month),
    linkedOfferPrice(supabase, funnelId),
  ]);

  const { data: existing } = await supabase
    .from("report_values")
    .select("id, value")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("metric_key", PRICE_KEY)
    .eq("entity_id", funnelId)
    .maybeSingle<{ id: string; value: number | null }>();

  const decision = decidePrice({
    stored: existing?.value ?? null,
    published,
    offerPrice,
    reason,
  });

  if (decision.action === "keep") return { changed: false };

  const { error } = existing
    ? await supabase
        .from("report_values")
        .update({ value: decision.price })
        .eq("id", existing.id)
    : await supabase.from("report_values").insert({
        workspace_id: workspaceId,
        month,
        metric_key: PRICE_KEY,
        entity_id: funnelId,
        value: decision.price,
        entered_by: enteredBy,
      });

  if (error) return { changed: false, error: error.message };
  return { changed: true };
}

/** Create a funnel, or change its setup. */
export async function saveFunnel(
  _prev: FunnelState,
  formData: FormData,
): Promise<FunnelState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("funnel_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const linkedOfferRaw = String(formData.get("linked_offer_id") ?? "").trim();
  const linkedOfferId = linkedOfferRaw === "" ? null : linkedOfferRaw;
  // Only needed to decide whether the link changed, which decides whether
  // this month's captured price moves with it.
  const month = firstOfMonth(String(formData.get("month") ?? ""));

  if (!name) return { error: "A funnel needs a name." };

  const supabase = await createClient();

  if (linkedOfferId) {
    const { data: offer } = await supabase
      .from("report_entities")
      .select("id")
      .eq("id", linkedOfferId)
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "offer")
      .maybeSingle<{ id: string }>();
    if (!offer) return { error: "That offer is not one of this client's." };
  }

  const previousLink = id ? (await supabase
    .from("report_entities")
    .select("linked_offer_id")
    .eq("id", id)
    .maybeSingle<{ linked_offer_id: string | null }>()).data?.linked_offer_id ?? null : null;

  const fields = {
    workspace_id: workspaceId,
    entity_type: "funnel" as const,
    name,
    linked_offer_id: linkedOfferId,
  };

  const { data: saved, error } = id
    ? await supabase.from("report_entities").update(fields).eq("id", id).select("id")
    : await supabase.from("report_entities").insert(fields).select("id");

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already a funnel called "${name}".` };
    }
    return { error: `Couldn't save the funnel: ${error.message}` };
  }

  const funnelId = (saved as { id: string }[] | null)?.[0]?.id ?? id;

  // Rule 5: a different offer on an unpublished month takes its price.
  // `applyPrice` is what refuses when the month is published.
  let priceMoved = false;
  if (funnelId && month && linkedOfferId !== previousLink) {
    const result = await applyPrice(supabase, {
      workspaceId,
      month,
      funnelId,
      reason: "offer_changed",
      enteredBy: access.reportUser.id,
    });
    if (result.error) {
      return { error: `Saved the funnel, but not its price: ${result.error}` };
    }
    priceMoved = result.changed;
  }

  revalidatePath("/reporting", "layout");
  return {
    notice: `${name} ${id ? "updated" : "added"}.${priceMoved ? " This month now uses the new offer's price." : ""}`,
  };
}

/** Retire a funnel. `active = false`, never a delete (rule 7). */
export async function retireFunnel(
  _prev: FunnelState,
  formData: FormData,
): Promise<FunnelState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("funnel_id") ?? "").trim();
  if (!id) return { error: "Which funnel?" };

  const supabase = await createClient();
  const restore = String(formData.get("restore") ?? "") === "1";
  const { error } = await supabase
    .from("report_entities")
    .update({ active: restore })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return { error: `Couldn't update the funnel: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return { notice: restore ? "Back in use." : "Retired. Its past months are untouched." };
}

/**
 * Take the linked offer's current price for this month.
 *
 * The route for a correction, and deliberately a button rather than
 * something that happens on its own. Refused on a published month by
 * `decidePrice`, not by this.
 */
export async function useCurrentOfferPrice(
  _prev: FunnelState,
  formData: FormData,
): Promise<FunnelState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const funnelId = String(formData.get("funnel_id") ?? "").trim();
  if (!month || !funnelId) return { error: "That was missing something." };

  const supabase = await createClient();
  const result = await applyPrice(supabase, {
    workspaceId,
    month,
    funnelId,
    reason: "use_current",
    enteredBy: access.reportUser.id,
  });

  if (result.error) return { error: `Couldn't update the price: ${result.error}` };
  if (!result.changed) {
    return {
      error:
        "That month's price did not change. A published month keeps the price it was sent with.",
    };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "This month now uses the offer's current price." };
}

/** This month's figures for every funnel, in one save. */
export async function saveFunnelMonth(
  _prev: FunnelState,
  formData: FormData,
): Promise<FunnelState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Which month?" };

  const supabase = await createClient();
  const { data: funnels } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "funnel")
    .returns<{ id: string }[]>();

  const known = new Set((funnels ?? []).map((f) => f.id));

  const submitted: { key: string; entityId: string; value: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = FIELD.exec(field);
    if (!match) continue;
    const [, key, entityId] = match;
    if (!FUNNEL_METRICS.has(key) || !known.has(entityId)) continue;
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
    .select("id, metric_key, entity_id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .in("metric_key", [...FUNNEL_METRICS])
    .returns<{ id: string; metric_key: string; entity_id: string | null }[]>();

  if (readError) return { error: `Couldn't read this month: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((row) => [`${row.metric_key}|${row.entity_id}`, row.id]),
  );

  for (const { key, entityId, value } of submitted) {
    const id = existing.get(`${key}|${entityId}`);
    const { error } = id
      ? await supabase.from("report_values").update({ value }).eq("id", id)
      : await supabase.from("report_values").insert({
          workspace_id: workspaceId,
          month,
          metric_key: key,
          entity_id: entityId,
          value,
          entered_by: access.reportUser.id,
        });

    if (error) return { error: `Couldn't save the figures: ${error.message}` };
  }

  // Rules 1 and 2: capture once, per funnel touched, and leave the rest
  // alone. A published month is refused inside applyPrice, so a re-save
  // in December cannot move what June was sent with.
  let captured = 0;
  for (const funnelId of new Set(submitted.map((s) => s.entityId))) {
    const result = await applyPrice(supabase, {
      workspaceId,
      month,
      funnelId,
      reason: "save",
      enteredBy: access.reportUser.id,
    });
    if (result.error) {
      return { error: `Saved the figures, but not the price: ${result.error}` };
    }
    if (result.changed) captured += 1;
  }

  revalidatePath("/reporting", "layout");
  return {
    notice: captured
      ? `Saved. ${captured === 1 ? "The offer's price was" : "Offer prices were"} captured for this month.`
      : "Saved. Funnels is up to date for this month.",
  };
}
