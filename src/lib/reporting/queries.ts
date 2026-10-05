import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { CategoryKey } from "./categories.ts";

/**
 * Reading a workspace's figures.
 *
 * Everything here goes through the caller's own session, so RLS is what
 * decides what comes back — a retainer client asking for an unpublished month
 * gets an empty list, not a filtered one. There is no service-role read
 * anywhere in this file, deliberately: the access rules are in the database
 * and this layer should not be able to talk its way around them.
 *
 * **On the 1,000-row limit** (§13). PostgREST caps a read, and the cap is
 * silent — you get 1,000 rows and no error. One month of one workspace is a
 * few hundred rows at most, so `getMonthData` is safe. Anything spanning
 * months is not: twelve months of every figure would run past it. So
 * `getTrend` takes an explicit list of metric keys and returns month-level
 * figures only, which keeps it to months × keys.
 */

export interface ReportMetric {
  key: string;
  category: CategoryKey;
  label: string;
  input_type: "core" | "optional" | "calc" | "pulled";
  unit: "count" | "currency" | "percent" | "hours" | "ratio" | "months" | "text";
  good_direction: "up" | "down" | "none";
  entity_type: "offer" | "funnel" | "ad_campaign" | "social_platform" | null;
  formula: string | null;
  sort_order: number;
}

export interface ReportWorkspace {
  id: string;
  kind: "retainer" | "aos_member" | "chiarezza";
  owner_user_id: string;
  business_name: string;
  currency: string;
  first_month: string;
  access_end_date: string | null;
  target_hourly_rate: number | null;
  benchmark_business_description: string | null;
  benchmark_main_offers: string | null;
  benchmark_country: string | null;
  hidden_categories: CategoryKey[];
}

export interface ReportEntity {
  id: string;
  workspace_id: string;
  entity_type: "offer" | "funnel" | "ad_campaign" | "social_platform";
  name: string;
  active: boolean;
  sort_order: number;
  price: number | null;
  pricing_model: "one_off" | "recurring" | null;
  hourly_cost: number | null;
  linked_offer_id: string | null;
  campaign_goal: string | null;
}

export interface ReportNote {
  id: string;
  workspace_id: string;
  month: string;
  category: CategoryKey | null;
  note_type: "strategist" | "reflection" | "objective" | "client_reply";
  author_id: string | null;
  author_name: string;
  body: string;
  position: number | null;
  created_at: string;
}

export interface ReportPeriod {
  id: string;
  workspace_id: string;
  month: string;
  published_at: string | null;
  published_by: string | null;
  /** When Resend accepted the publish email. Not proof it arrived. */
  email_sent_at: string | null;
  /** Why it did not go, in the sender's own words. */
  email_error: string | null;
  /** The address it went to, copied at send time. */
  email_to: string | null;
}

interface RawValue {
  metric_key: string;
  entity_id: string | null;
  value: number | null;
  source: "manual" | "csv";
}

/**
 * A month's figures, addressed the way screens actually ask for them.
 *
 * A plain array would mean every field on every entry page running its own
 * `.find()`, which is both slow and easy to get wrong when an entity is
 * involved — `undefined` and `null` entity ids are not the same key.
 */
export class ValueBag {
  private readonly byKey: Map<string, number | null>;
  private readonly sources: Map<string, "manual" | "csv">;

  constructor(rows: RawValue[]) {
    this.byKey = new Map();
    this.sources = new Map();
    for (const row of rows) {
      const k = ValueBag.key(row.metric_key, row.entity_id);
      this.byKey.set(k, ValueBag.toNumber(row.value));
      this.sources.set(k, row.source);
    }
  }

  /**
   * A figure, as a number or nothing.
   *
   * `numeric` is the one Postgres type whose JSON representation is not
   * guaranteed to be a number — drivers hand it back as a string to keep
   * precision, and PostgREST sends it unquoted. The formula module tests
   * `typeof value === "number"`, so a string arriving here would not be an
   * error anywhere: every figure derived from it would quietly become a
   * dash. Normalising at the boundary means only this line has to know.
   */
  private static toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private static key(metricKey: string, entityId?: string | null): string {
    return `${metricKey}|${entityId ?? ""}`;
  }

  /** The figure, or null when it was never entered. */
  get(metricKey: string, entityId?: string | null): number | null {
    return this.byKey.get(ValueBag.key(metricKey, entityId)) ?? null;
  }

  /** Whether anything at all was entered — distinct from a stored zero. */
  has(metricKey: string, entityId?: string | null): boolean {
    return this.byKey.has(ValueBag.key(metricKey, entityId));
  }

  /** Where it came from, so a CSV-filled box can be marked as such (§10). */
  sourceOf(metricKey: string, entityId?: string | null): "manual" | "csv" | null {
    return this.sources.get(ValueBag.key(metricKey, entityId)) ?? null;
  }

  get size(): number {
    return this.byKey.size;
  }
}

/**
 * The metric list. Reference data, the same for everyone, 174 rows.
 *
 * Cached per request. It is read on every reporting screen, and a `select *`
 * of a lookup table behind every page render is the sort of thing that is
 * invisible until there are enough clients for it not to be.
 */
export const getMetrics = cache(async (): Promise<ReportMetric[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_metrics")
    .select("*")
    .order("category")
    .order("sort_order")
    .returns<ReportMetric[]>();

  if (error) throw new Error(`Could not read the metric list: ${error.message}`);
  return data ?? [];
});

/** The metrics of one category, in the order the brief lists them. */
export async function getMetricsFor(category: CategoryKey): Promise<ReportMetric[]> {
  return (await getMetrics()).filter((m) => m.category === category);
}

export const getWorkspace = cache(
  async (workspaceId: string): Promise<ReportWorkspace | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("report_workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle<ReportWorkspace>();

    // No error branch on purpose: RLS returning nothing and the row not
    // existing are the same answer to the caller, and the caller must treat
    // both as "you cannot see this".
    return data ?? null;
  },
);

export interface MonthData {
  period: ReportPeriod | null;
  values: ValueBag;
  /** The month before, for "August: 24,650" and month-on-month change. */
  previous: ValueBag;
  entities: ReportEntity[];
  notes: ReportNote[];
}

/**
 * Everything one month's screens need, in four round trips rather than one
 * per field.
 *
 * `previousMonth` is fetched alongside because almost every calculated figure
 * needs it — follower growth, unsubscribe rate against last month's list, and
 * every month-on-month arrow.
 */
export async function getMonthData(
  workspaceId: string,
  month: string,
  previousMonth: string | null,
): Promise<MonthData> {
  const supabase = await createClient();

  const months = previousMonth ? [month, previousMonth] : [month];

  const [periodResult, valueResult, entityResult, noteResult] = await Promise.all([
    supabase
      .from("report_periods")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("month", month)
      .maybeSingle<ReportPeriod>(),
    supabase
      .from("report_values")
      .select("metric_key, entity_id, value, source, month")
      .eq("workspace_id", workspaceId)
      .in("month", months)
      .returns<(RawValue & { month: string })[]>(),
    supabase
      .from("report_entities")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("entity_type")
      .order("sort_order")
      .returns<ReportEntity[]>(),
    supabase
      .from("report_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("month", month)
      .order("created_at")
      .returns<ReportNote[]>(),
  ]);

  const rows = valueResult.data ?? [];

  return {
    period: periodResult.data ?? null,
    values: new ValueBag(rows.filter((r) => r.month === month)),
    previous: new ValueBag(rows.filter((r) => r.month === previousMonth)),
    entities: entityResult.data ?? [],
    notes: noteResult.data ?? [],
  };
}

/**
 * One measure across several months, for the charts.
 *
 * Month-level only — `entity_id is null` — and an explicit key list, because
 * this is the query that would otherwise sail past the 1,000-row cap. Twelve
 * months of two metrics is 24 rows.
 */
export async function getTrend(
  workspaceId: string,
  metricKeys: string[],
  fromMonth: string,
  toMonth: string,
): Promise<{ month: string; metric_key: string; value: number | null }[]> {
  if (metricKeys.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("report_values")
    .select("month, metric_key, value")
    .eq("workspace_id", workspaceId)
    .is("entity_id", null)
    .in("metric_key", metricKeys)
    .gte("month", fromMonth)
    .lte("month", toMonth)
    .order("month")
    .returns<{ month: string; metric_key: string; value: number | null }[]>();

  return data ?? [];
}

export interface ReportTarget {
  metric_key: string;
  entity_id: string | null;
  month: string | null;
  target_value: number;
}

/**
 * Targets for a month: the ones set for that month, plus the standing ones.
 *
 * A month-specific target wins over a standing one for the same metric (§7: "A
 * target can be one monthly figure or change by month"), so the more specific
 * row is applied second and overwrites.
 */
export async function getTargets(
  workspaceId: string,
  month: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_targets")
    .select("metric_key, entity_id, month, target_value")
    .eq("workspace_id", workspaceId)
    .or(`month.is.null,month.eq.${month}`)
    .returns<ReportTarget[]>();

  const byKey = new Map<string, number>();
  for (const row of (data ?? []).filter((r) => r.month === null)) {
    byKey.set(`${row.metric_key}|${row.entity_id ?? ""}`, row.target_value);
  }
  for (const row of (data ?? []).filter((r) => r.month !== null)) {
    byKey.set(`${row.metric_key}|${row.entity_id ?? ""}`, row.target_value);
  }
  return byKey;
}

export async function getBenchmarks(workspaceId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_benchmarks")
    .select("metric_key, benchmark_value")
    .eq("workspace_id", workspaceId)
    .returns<{ metric_key: string; benchmark_value: number }[]>();

  return new Map((data ?? []).map((r) => [r.metric_key, r.benchmark_value]));
}

/**
 * The months a retainer client is allowed to be offered: the published ones.
 *
 * §8: a draft is the team's. Showing a client a month they cannot read and
 * then telling them each section "wasn't part of this month's report" is
 * worse than not offering it — the sections were there, they just are not
 * theirs yet.
 */
export async function getPublishedMonths(workspaceId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_periods")
    .select("month")
    .eq("workspace_id", workspaceId)
    .not("published_at", "is", null)
    .order("month", { ascending: false })
    .returns<{ month: string }[]>();

  return (data ?? []).map((r) => r.month);
}
