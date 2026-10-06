"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";
import { readBenchmarkReply, type BenchmarkMetric } from "./benchmark-paste.ts";

/**
 * Saving a pasted benchmark reply (§7).
 *
 * **aOS never works a benchmark out**, so there is nothing here that
 * estimates: the reply is read, what it names is stored, and every line
 * that could not be read is kept and shown. `benchmarks_unmatched`
 * exists for exactly that, so a client who pastes thirteen lines and
 * gets four does not have to work out which nine were missed.
 */

export type BenchmarkState =
  | { error?: string; notice?: string; unmatched?: string[] }
  | null;

export async function saveBenchmarkReply(
  _prev: BenchmarkState,
  formData: FormData,
): Promise<BenchmarkState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const reply = String(formData.get("reply") ?? "");
  if (!workspaceId) return { error: "Which client?" };
  if (reply.trim() === "") return { error: "There's nothing pasted to read." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayEdit) return { error: "Benchmarks are set by your strategist." };

  const supabase = await createClient();

  // Only metrics a benchmark makes sense for: one with a direction, held
  // at month level. A benchmark for a per-offer figure has no single
  // thing to compare against.
  const { data: metricRows } = await supabase
    .from("report_metrics")
    .select("key, label, unit, good_direction, entity_type")
    .returns<
      (BenchmarkMetric & { good_direction: string; entity_type: string | null })[]
    >();

  const metrics = (metricRows ?? []).filter(
    (m) => m.good_direction !== "none" && m.entity_type === null,
  );

  const { matched, unmatched } = readBenchmarkReply(reply, metrics);

  if (matched.length === 0) {
    return {
      error:
        "Nothing in that could be read as a benchmark. Each line needs to name one of the figures and carry one number.",
      unmatched,
    };
  }

  for (const row of matched) {
    const { error } = await supabase.from("report_benchmarks").upsert(
      {
        workspace_id: workspaceId,
        metric_key: row.key,
        benchmark_value: row.value,
      },
      { onConflict: "workspace_id,metric_key" },
    );
    if (error) return { error: `Couldn't save ${row.label}: ${error.message}`, unmatched };
  }

  const { error: stampError } = await supabase
    .from("report_workspaces")
    .update({
      benchmarks_set_at: new Date().toISOString(),
      benchmarks_unmatched: unmatched,
    })
    .eq("id", workspaceId);

  if (stampError) {
    return {
      error: `Saved the benchmarks, but not the record of when: ${stampError.message}`,
      unmatched,
    };
  }

  revalidatePath("/reporting", "layout");
  return {
    notice: `${matched.length} benchmark${matched.length === 1 ? "" : "s"} saved.`,
    unmatched,
  };
}
