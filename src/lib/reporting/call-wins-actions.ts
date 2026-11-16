"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { BESPOKE_SALES, BESPOKE_VALUE, CALL_WINS_SALES } from "./call-wins.ts";
import { lockedError } from "./locked.ts";
import { fromInputValue } from "./format.ts";
import { firstOfMonth } from "./months.ts";
import { isInternalReportPath } from "./paths.ts";
import { getWorkspace } from "./queries.ts";
import { withSaved } from "./saved-notice.ts";

/**
 * What the month's calls turned into, offer by offer (§5.6).
 *
 * Nina, 16 November: "add calls converted and what they bought (by offer,
 * with revenue)". One figure per offer, which is why this cannot go through
 * `saveCategoryValues` — that action writes one value per metric per month,
 * and these are one per metric per OFFER.
 *
 * Revenue is not here because revenue is not typed: it is the sales times
 * the offer's price, worked out by `callWinResults`. Nothing to save means
 * nothing to disagree with the Offers page about.
 *
 * A Server Action is a public endpoint, so the workspace, the month and
 * every offer id are re-checked here and the write goes through the
 * editor's own session, where RLS has the final say.
 */

export type CallWinsState = { error?: string } | null;

/** One box per offer: `w:<offer id>`. */
const FIELD = /^w:([0-9a-f-]{36})$/;

/**
 * The bespoke line's two boxes, which belong to the month.
 *
 * Work priced per job has no offer row and no price, so neither figure can
 * be worked out and both are typed (Dom, 16 November). They are written
 * here rather than by `saveCategoryValues` for the same reason the per-offer
 * figure is: this is the form they are on, and a figure saved by one button
 * and shown under another is how two screens start disagreeing.
 */
const BESPOKE_FIELDS: Record<string, string> = {
  "b:sales": BESPOKE_SALES,
  "b:value": BESPOKE_VALUE,
};

export async function saveCallWins(
  _prev: CallWinsState,
  formData: FormData,
): Promise<CallWinsState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) {
    return { error: "That save was missing something. Reload the page and try again." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayEdit) return { error: "Your report is filled in by your Allegro team." };

  const supabase = await createClient();

  // The offers this client actually has. A posted id that is not one of
  // theirs is dropped rather than written: the database would refuse a
  // cross-workspace entity anyway, and this says so before the write.
  const { data: offerRows } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "offer")
    .returns<{ id: string }[]>();
  const known = new Set((offerRows ?? []).map((o) => o.id));

  const submitted: { key: string; entityId: string | null; value: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;

    const bespoke = BESPOKE_FIELDS[field];
    if (bespoke) {
      submitted.push({ key: bespoke, entityId: null, value: fromInputValue(raw) });
      continue;
    }

    const match = FIELD.exec(field);
    if (!match || !known.has(match[1])) continue;
    submitted.push({ key: CALL_WINS_SALES, entityId: match[1], value: fromInputValue(raw) });
  }

  if (submitted.length === 0) return { error: "Nothing to save." };

  // The month has to exist as a period before it can hold figures.
  // Duplicates ignored rather than updated: this must never touch
  // published_at, which is Nina's alone and guarded in the database.
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
    .in("metric_key", [CALL_WINS_SALES, BESPOKE_SALES, BESPOKE_VALUE])
    .returns<
      { id: string; metric_key: string; entity_id: string | null; value: number | null }[]
    >();

  if (readError) return { error: `Couldn't read this month: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((row) => [`${row.metric_key}|${row.entity_id ?? ""}`, row]),
  );

  let changed = 0;
  for (const { key, entityId, value } of submitted) {
    const row = existing.get(`${key}|${entityId ?? ""}`);
    if (row && row.value === value) continue;

    const { error } = row
      ? await supabase.from("report_values").update({ value }).eq("id", row.id)
      : await supabase.from("report_values").insert({
          workspace_id: workspaceId,
          month,
          metric_key: key,
          entity_id: entityId,
          value,
          entered_by: reportUser.id,
        });

    // Checked, every time: a guard trigger refusing one of these is the
    // difference between "no sales from calls" and "the save never landed",
    // and a silent failure reads as the first. `lockedError` is the one
    // refusal worth its own sentence — a form left open in another tab
    // while the month was published, which reads as a fault otherwise.
    if (error) {
      return {
        error: lockedError(error) ?? `Couldn't save what the calls bought: ${error.message}`,
      };
    }
    changed += 1;
  }

  revalidatePath("/reporting", "layout");

  /**
   * The confirmation goes in the URL, never in this action's return value.
   *
   * A form that submits before React has attached loses the state it
   * returns, and a save that works and says nothing is the bug this
   * project has been caught by three times — see `saved-notice.ts`.
   * Errors still come back above, so what was typed stays in the boxes.
   */
  const here = String(formData.get("here") ?? "");
  if (here && isInternalReportPath(here)) {
    redirect(withSaved(here, changed === 0 ? "nothing-changed" : "wins"));
  }

  return null;
}
