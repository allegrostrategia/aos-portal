"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";

/**
 * Targets (§7).
 *
 * "A target can be one monthly figure or change by month", so each one is
 * either **standing** — no month, applying to every month that has no
 * target of its own — or **for this month**, which wins over the standing
 * one. That precedence is already in `getTargets`; this is the screen's
 * half of it.
 *
 * Who sets them is who may edit the figures: Nina or an assigned team
 * member for a retainer client, the member themselves for a self-serve
 * workspace. Same screen, different person in front of it (§7).
 *
 * **An emptied box removes the target**, which is a delete — and the
 * right one. A target of nothing is not a target, and leaving a zero
 * behind would turn every figure red.
 */

export type TargetState = { error?: string; notice?: string } | null;

/** `target:<metric key>` and `scope:<metric key>` = "standing" | "month". */
const FIELD = /^target:([a-z0-9_]+)$/;

export async function saveTargets(
  _prev: TargetState,
  formData: FormData,
): Promise<TargetState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) return { error: "That was missing something." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayEdit) return { error: "Targets are set by your strategist." };

  const supabase = await createClient();

  const { data: metrics } = await supabase
    .from("report_metrics")
    .select("key")
    .returns<{ key: string }[]>();
  const known = new Set((metrics ?? []).map((m) => m.key));

  const { data: existingRows, error: readError } = await supabase
    .from("report_targets")
    .select("id, metric_key, month")
    .eq("workspace_id", workspaceId)
    .returns<{ id: string; metric_key: string; month: string | null }[]>();

  if (readError) return { error: `Couldn't read the targets: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((row) => [`${row.metric_key}|${row.month ?? ""}`, row.id]),
  );

  let changed = 0;
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = FIELD.exec(field);
    if (!match) continue;
    const [, metricKey] = match;
    if (!known.has(metricKey)) continue;

    const forThisMonth = String(formData.get(`scope:${metricKey}`) ?? "standing") === "month";
    const targetMonth = forThisMonth ? month : null;
    const value = fromInputValue(raw);
    const id = existing.get(`${metricKey}|${targetMonth ?? ""}`);

    if (value === null) {
      if (!id) continue;
      // Checked, not assumed: a delete refused by RLS is not an error.
      const { data: removed, error } = await supabase
        .from("report_targets")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return { error: `Couldn't clear a target: ${error.message}` };
      if (!removed || removed.length === 0) {
        return { error: "A target could not be cleared. Nothing else was changed." };
      }
      changed += 1;
      continue;
    }

    if (value < 0) return { error: "A target cannot be negative." };

    const { error } = id
      ? await supabase.from("report_targets").update({ target_value: value }).eq("id", id)
      : await supabase.from("report_targets").insert({
          workspace_id: workspaceId,
          metric_key: metricKey,
          month: targetMonth,
          target_value: value,
        });

    if (error) return { error: `Couldn't save a target: ${error.message}` };
    changed += 1;
  }

  if (changed === 0) return { notice: "Nothing changed." };

  revalidatePath("/reporting", "layout");
  return { notice: `${changed} target${changed === 1 ? "" : "s"} saved.` };
}
