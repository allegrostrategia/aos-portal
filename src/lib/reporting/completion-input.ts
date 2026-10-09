import "server-only";

import { ENTRY_CATEGORIES } from "./categories.ts";
import { categoryCompletion, type CompletionInput } from "./completion.ts";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whether a month's visible sections are all filled, read with the
 * service role.
 *
 * **The same function the Overview's "Still to fill in" uses**, fed the
 * same four things. A reminder that disagrees with the list on screen —
 * chasing somebody whose report reads as finished — is worse than no
 * reminder, and two implementations of "done" would eventually do
 * exactly that.
 *
 * The service role is why this exists at all: the cron has no session,
 * so it cannot go through `getMonthFigures`, which reads as the member.
 */
export async function monthIsFinished(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  month: string,
): Promise<boolean> {
  const [{ data: workspace }, { data: metrics }, { data: values }, { data: entities }, { data: opening }] =
    await Promise.all([
      admin
        .from("report_workspaces")
        .select("hidden_categories")
        .eq("id", workspaceId)
        .maybeSingle(),
      admin.from("report_metrics").select("key, category, input_type, entity_type"),
      admin
        .from("report_values")
        .select("metric_key, entity_id, value")
        .eq("workspace_id", workspaceId)
        .eq("month", month),
      admin
        .from("report_entities")
        .select("id, entity_type, active")
        .eq("workspace_id", workspaceId),
      // §5.8's opening figure is answered once, in whichever month they
      // happened to answer it — so it is looked for across all of them,
      // exactly as `computeCarried` does.
      admin
        .from("report_values")
        .select("value")
        .eq("workspace_id", workspaceId)
        .eq("metric_key", "client_experience_clients_at_start_opening")
        .lte("month", month)
        .limit(1),
    ]);

  if (!workspace) return false;

  const rows = (values ?? []) as { metric_key: string; entity_id: string | null; value: unknown }[];
  const byKey = new Map<string, unknown>();
  const byKeyAndEntity = new Map<string, unknown>();
  for (const row of rows) {
    if (row.entity_id === null) byKey.set(row.metric_key, row.value);
    else byKeyAndEntity.set(`${row.metric_key}|${row.entity_id}`, row.value);
  }

  const allEntities = (entities ?? []) as { id: string; entity_type: string; active: boolean }[];
  const platforms = allEntities.filter((e) => e.entity_type === "social_platform" && e.active);

  const asNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const input: CompletionInput = {
    metrics: (metrics ?? []) as CompletionInput["metrics"],
    // The single social platform resolves through here, which is how the
    // screen's `figure()` behaves and why Social Media is not treated as
    // row-backed.
    figure: (key) => {
      const direct = asNumber(byKey.get(key));
      if (direct !== null) return direct;
      for (const platform of platforms) {
        const found = asNumber(byKeyAndEntity.get(`${key}|${platform.id}`));
        if (found !== null) return found;
      }
      return null;
    },
    openingClients: { inUse: (opening ?? []).length > 0 ? (opening ?? [])[0] : null },
    data: {
      entities: allEntities,
      values: { get: (key, entityId) => asNumber(byKeyAndEntity.get(`${key}|${entityId}`)) },
    },
  };

  const hidden = (workspace as { hidden_categories: string[] }).hidden_categories ?? [];
  return ENTRY_CATEGORIES.filter((c) => !hidden.includes(c.key)).every((c) => {
    const { filled, total } = categoryCompletion(input, c.key);
    return total === 0 || filled === total;
  });
}
