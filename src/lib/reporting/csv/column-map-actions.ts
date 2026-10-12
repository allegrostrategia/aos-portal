"use server";

import { revalidatePath } from "next/cache";

import { canEdit } from "../access.ts";
import { getWorkspace } from "../queries.ts";
import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";

/**
 * §10.2's custom conversions: what a client's own conversion column
 * counts as.
 *
 * Clients name their own conversion events — the brief's sample has an
 * "Autumn Workshop Opt In" column — and only they know whether it is a
 * lead, a purchase, or neither. So the importer never guesses: an
 * unrecognised column is listed, somebody says what it is, and the
 * answer is remembered for their next upload.
 *
 * **Remembered per workspace and platform**, which is the unique key on
 * the table, so saying it twice corrects rather than duplicates.
 *
 * This is a preference, not a figure, which is why it saves on its own
 * rather than waiting for the month's save: nothing about it belongs to
 * a month, and a person who has just told us what a column means should
 * not have to remember to press something else.
 */

export type ColumnMapState = { error?: string; notice?: string } | null;

const CHOICES = new Set(["leads", "purchases", "ignored"]);

/**
 * The fourth answer: forget what was said.
 *
 * Different from `ignored`, which is a decision — "this column is not a
 * lead and not a purchase". Forgetting removes the row so the next
 * upload asks again, which is what somebody wants when they answered
 * the wrong way round or the column has changed meaning.
 */
const FORGET = "forget";

export async function saveColumnMaps(
  _prev: ColumnMapState,
  formData: FormData,
): Promise<ColumnMapState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const platform = String(formData.get("platform") ?? "");
  if (!workspaceId || !platform) {
    return { error: "That was missing something. Reload and try again." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };
  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  if (!canEdit({ role: grant?.role ?? null, kind: workspace.kind, isAdmin: reportUser.isAdmin })) {
    return { error: "That report isn't yours to change." };
  }

  // `column:<name>` → the choice. The name is whatever the file called
  // it, so it is never parsed out of the field — it is the value.
  const rows: { workspace_id: string; platform: string; column_name: string; maps_to: string }[] =
    [];
  const forget: string[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    if (!field.startsWith("column:")) continue;
    const columnName = field.slice("column:".length).trim();
    if (columnName === "") continue;
    if (raw === FORGET) {
      forget.push(columnName);
      continue;
    }
    if (!CHOICES.has(raw)) continue;
    rows.push({
      workspace_id: workspaceId,
      platform,
      column_name: columnName,
      maps_to: raw,
    });
  }

  if (rows.length === 0 && forget.length === 0) return { error: "Nothing chosen yet." };

  const supabase = await createClient();

  if (forget.length > 0) {
    // **Only the answer is forgotten.** Months already saved keep their
    // figures: this changes what a future upload counts, and nothing
    // that has already been written (Dom, 12 October).
    const { error } = await supabase
      .from("report_column_maps")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("platform", platform)
      .in("column_name", forget);
    // A delete RLS refuses matches no rows rather than erroring, so this
    // catches a genuine database failure only — the refusal itself is
    // caught by the `canEdit` check above, which a client hits first.
    if (error) return { error: `Couldn't forget those: ${error.message}` };
  }

  if (rows.length === 0) {
    revalidatePath("/reporting", "layout");
    return { notice: forget.length === 1 ? "Forgotten." : "Forgotten them." };
  }
  const { data, error } = await supabase
    .from("report_column_maps")
    .upsert(rows, { onConflict: "workspace_id,platform,column_name" })
    .select("id");

  if (error) return { error: `Couldn't remember those: ${error.message}` };
  // Checked, not assumed: an upsert RLS refuses is not an error.
  //
  // **Unreachable today, and kept anyway** — the same shape as the
  // campaign insert: anyone past the `canEdit` check above also passes
  // `report_column_maps_editors`, because both ask `report_can_edit`.
  // A mutation that deletes this fails nothing. It is here for the day
  // the two stop agreeing.
  if (!data || data.length !== rows.length) {
    return { error: "That report isn't yours to change." };
  }

  revalidatePath("/reporting", "layout");
  return { notice: `Remembered ${rows.length === 1 ? "it" : "them"}.` };
}


/**
 * The record that a file became figures (§9's `report_csv_imports`).
 *
 * **Written on save, not on upload**, because nothing happened until
 * the figures did: a person who reads a preview and walks away has not
 * imported anything, and a row saying they did would be the only
 * evidence of something that never occurred.
 *
 * The file itself is never stored — only its name, which is the answer
 * to "which export did this figure come from" when one looks wrong. A
 * name is not content.
 *
 * Append-only by design: the table has insert and select policies and
 * no update or delete, because the record of where a figure came from
 * is the thing somebody would want to change if the figure turned out
 * to be wrong.
 */
export async function recordCsvImportFromForm(
  formData: FormData,
  workspaceId: string,
  month: string,
): Promise<void> {
  const fileName = String(formData.get("import:file_name") ?? "").trim();
  const platform = String(formData.get("import:platform") ?? "");
  if (fileName === "" || (platform !== "meta_content" && platform !== "meta_ads")) return;

  const fieldsFilled = String(formData.get("import:fields") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f !== "");

  // **Not awaited for its error, and deliberately.** The figures are
  // saved by the time this runs; a record that failed to write is worth
  // knowing about and is not worth refusing somebody's month over.
  const result = await recordCsvImport({
    workspaceId,
    month,
    platform,
    fileName,
    fieldsFilled,
  });
  if (result.error) console.error("report_csv_imports:", result.error);
}

export async function recordCsvImport(input: {
  workspaceId: string;
  month: string;
  platform: "meta_content" | "meta_ads";
  fileName: string;
  fieldsFilled: string[];
}): Promise<{ error?: string }> {
  const reportUser = await requireReportUser();

  const workspace = await getWorkspace(input.workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };
  const grant = reportUser.grants.find((g) => g.workspace_id === input.workspaceId);
  if (!canEdit({ role: grant?.role ?? null, kind: workspace.kind, isAdmin: reportUser.isAdmin })) {
    return { error: "That report isn't yours to change." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_csv_imports")
    .insert({
      workspace_id: input.workspaceId,
      month: input.month,
      platform: input.platform,
      // Trimmed and capped: a file name comes from somebody's machine.
      file_name: input.fileName.trim().slice(0, 200) || "(no name)",
      uploaded_by: reportUser.id,
      fields_filled: input.fieldsFilled,
    })
    .select("id");

  if (error) return { error: `Couldn't record that import: ${error.message}` };
  if (!data || data.length === 0) return { error: "That report isn't yours to change." };
  return {};
}
