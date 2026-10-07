import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { activeClientsAtStart } from "./client-flow.ts";
import { buildCarried, type Carried } from "./carried.ts";
import { previousMonthOf } from "./months.ts";

/**
 * Work out what a month is being published with.
 *
 * **With the service role, deliberately.** The snapshot has to be what the
 * report truly contains, not what the person pressing Publish happens to be
 * able to read. Nina can read everything anyway, but deriving it from her
 * session would make the stored figures depend on who published — the same
 * bug in a different coat, and the hardest kind to notice.
 *
 * Reads are deliberately not the `queries.ts` ones: those use the
 * member-facing client, which is exactly the RLS-shaped behaviour this
 * exists to escape.
 */
export async function computeCarried(
  workspaceId: string,
  month: string,
): Promise<Carried> {
  const admin = createAdminClient();
  const previousMonth = previousMonthOf(month);

  const [flowRes, previousRes, targetRes, benchmarkRes, entityRes] = await Promise.all([
    admin
      .from("report_values")
      .select("month, metric_key, value")
      .eq("workspace_id", workspaceId)
      .is("entity_id", null)
      .in("metric_key", [
        "client_experience_clients_at_start_opening",
        "leads_conversions_new_clients",
        "client_experience_clients_who_left",
      ])
      .lte("month", month)
      .returns<{ month: string; metric_key: string; value: number | string | null }[]>(),
    admin
      .from("report_values")
      .select("metric_key, entity_id, value")
      .eq("workspace_id", workspaceId)
      .eq("month", previousMonth)
      .returns<{ metric_key: string; entity_id: string | null; value: number | string | null }[]>(),
    admin
      .from("report_targets")
      .select("metric_key, entity_id, month, target_value")
      .eq("workspace_id", workspaceId)
      .or(`month.is.null,month.eq.${month}`)
      .returns<
        { metric_key: string; entity_id: string | null; month: string | null; target_value: number }[]
      >(),
    admin
      .from("report_benchmarks")
      .select("metric_key, benchmark_value")
      .eq("workspace_id", workspaceId)
      .returns<{ metric_key: string; benchmark_value: number }[]>(),
    admin
      .from("report_entities")
      .select("id, name, campaign_goal")
      .eq("workspace_id", workspaceId)
      .returns<{ id: string; name: string; campaign_goal: string | null }[]>(),
  ]);

  // `numeric` comes back as a string from some drivers, and the formula
  // module tests `typeof value === "number"` — the same trap `ValueBag`
  // normalises at its own boundary.
  const num = (v: number | string | null): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const byMonth = new Map<string, { month: string; opening?: number | null; newClients?: number | null; clientsWhoLeft?: number | null }>();
  for (const row of flowRes.data ?? []) {
    const m = byMonth.get(row.month) ?? { month: row.month };
    if (row.metric_key === "client_experience_clients_at_start_opening") m.opening = num(row.value);
    else if (row.metric_key === "leads_conversions_new_clients") m.newClients = num(row.value);
    else m.clientsWhoLeft = num(row.value);
    byMonth.set(row.month, m);
  }
  const flow = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

  const previous: Record<string, number | null> = {};
  for (const row of previousRes.data ?? []) {
    previous[`${row.metric_key}|${row.entity_id ?? ""}`] = num(row.value);
  }

  // A month's own target wins over the standing one, which is the order
  // `getTargets` applies and must stay the same, or the snapshot would
  // freeze a different target from the one the screen drew.
  const targets: Record<string, number> = {};
  for (const row of (targetRes.data ?? []).filter((r) => r.month === null)) {
    targets[`${row.metric_key}|${row.entity_id ?? ""}`] = row.target_value;
  }
  for (const row of (targetRes.data ?? []).filter((r) => r.month !== null)) {
    targets[`${row.metric_key}|${row.entity_id ?? ""}`] = row.target_value;
  }

  const benchmarks: Record<string, number> = {};
  for (const row of benchmarkRes.data ?? []) benchmarks[row.metric_key] = row.benchmark_value;

  return buildCarried({
    clientsAtStart: activeClientsAtStart(flow, month),
    previousClientsAtStart: previousMonth ? activeClientsAtStart(flow, previousMonth) : null,
    previous,
    targets,
    benchmarks,
    entities: entityRes.data ?? [],
  });
}

/**
 * Months before this one, in the same workspace, that hold figures and are
 * still drafts.
 *
 * Dom, 7 October: publishing September while August is a draft freezes
 * August's unfinished figures into September's snapshot, and nothing would
 * ever say so. A warning rather than a refusal — she may have a reason, and
 * a month she will never publish is a real case.
 */
export async function draftMonthsBefore(
  workspaceId: string,
  month: string,
): Promise<string[]> {
  const admin = createAdminClient();

  const [periods, values] = await Promise.all([
    admin
      .from("report_periods")
      .select("month, published_at")
      .eq("workspace_id", workspaceId)
      .lt("month", month)
      .returns<{ month: string; published_at: string | null }[]>(),
    admin
      .from("report_values")
      .select("month")
      .eq("workspace_id", workspaceId)
      .lt("month", month)
      .returns<{ month: string }[]>(),
  ]);

  // A month with nothing in it is not unfinished, it is absent — warning
  // about one would make the warning noise on every first publish.
  const withFigures = new Set((values.data ?? []).map((r) => r.month));

  return (periods.data ?? [])
    .filter((p) => p.published_at === null && withFigures.has(p.month))
    .map((p) => p.month)
    .sort();
}
