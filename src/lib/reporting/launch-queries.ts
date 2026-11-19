import "server-only";

import { createClient } from "@/lib/supabase/server";
import { launchFieldName, type LaunchAt, type LaunchFigures } from "./launch-fields.ts";

/**
 * Reading launches (§6).
 *
 * A launch is not a month. It has its own dates, its own page and its own
 * publish, so none of `queries.ts`'s month-shaped loaders fit — and
 * bending them to fit is how a month-keyed assumption ends up inside a
 * thing that has no month.
 *
 * Everything here reads through the member-facing client, so the access
 * rules decide what comes back: a retainer client sees a launch once it is
 * published, an editor sees their drafts, and a self-serve member always
 * sees their own. That is `report_can_read_launch`, and it is the same
 * function the storage policy on the cover image asks.
 */

export type LaunchStatus = "planning" | "live" | "completed";

export type LaunchStageType =
  | "challenge"
  | "masterclass"
  | "webinar"
  | "workshop"
  | "waitlist"
  | "open_cart"
  | "other";

export interface LaunchRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  offer_entity_id: string | null;
  status: LaunchStatus;
  cover_image_path: string | null;
  goal_good: number | null;
  goal_better: number | null;
  goal_best: number | null;
  /** Good/Better/Best on sign-ups (Nina, 19 November). */
  sign_up_goal_good: number | null;
  sign_up_goal_better: number | null;
  sign_up_goal_best: number | null;
  /** A link to the client's own lead sheet. No names live in aOS. */
  lead_tracker_url: string | null;
  planner_show_up_rate: number | null;
  planner_conversion_rate: number | null;
  published_at: string | null;
  /** When "Send update to client" last went. Null means never. */
  update_email_sent_at: string | null;
  carried: unknown;
}

export interface LaunchStage {
  id: string;
  launch_id: string;
  position: number;
  stage_type: LaunchStageType;
  name: string;
  promo_start: string | null;
  promo_end: string | null;
  live_start: string | null;
  live_end: string | null;
  live_days: number | null;
  sign_up_goal: number | null;
  attendance_goal: number | null;
  is_main_selling_stage: boolean;
}

export type LaunchPricePlan = "full" | "monthly";

export interface LaunchPrice {
  id: string;
  launch_id: string;
  name: string;
  /**
   * The full contract value, whichever plan this is.
   *
   * For a monthly option that is `instalment_amount` × `instalments`,
   * worked out on save rather than at read time — so total revenue needs
   * no special case and the two cannot disagree.
   */
  price: number;
  plan: LaunchPricePlan;
  /** Monthly: how many months. A plan: how many instalments. */
  instalments: number | null;
  instalment_amount: number | null;
  is_main: boolean;
}

/** One of the client's own named sources, with its sign-up target. */
export interface LaunchSource {
  id: string;
  launch_id: string;
  name: string;
  position: number;
  sign_up_target: number | null;
}

/** One email of the launch: which stage, which number, and its words. */
export interface LaunchEmail {
  id: string;
  launch_id: string;
  stage_id: string;
  number: number;
  sent_on: string | null;
  subject: string | null;
  is_resend: boolean;
}

interface RawLaunchValue {
  metric_key: string;
  stage_id: string | null;
  price_id: string | null;
  source_id: string | null;
  day_number: number | null;
  email_number: number | null;
  value: number | string | null;
}

/**
 * A launch's figures, addressed the way §6 asks for them.
 *
 * Four kinds of context, and a figure may use any of them: per stage
 * (sign-ups), per stage and day (live attendees on day 3), per stage and
 * email (open rate of the second email), per price option (sales), or none
 * at all (cash collected). One bag with one key shape rather than four
 * lookups, for the reason `ValueBag` exists on the monthly side.
 */
export class LaunchValues {
  private readonly byKey: Map<string, number | null>;

  constructor(rows: RawLaunchValue[]) {
    this.byKey = new Map();
    for (const row of rows) {
      this.byKey.set(
        LaunchValues.key(row.metric_key, {
          stageId: row.stage_id,
          priceId: row.price_id,
          sourceId: row.source_id,
          day: row.day_number,
          email: row.email_number,
        }),
        LaunchValues.toNumber(row.value),
      );
    }
  }

  /** The same normalisation `ValueBag` does, and for the same reason: a
   * `numeric` can arrive as a string, and every figure derived from a
   * string quietly becomes a dash. */
  private static toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private static key(metricKey: string, at: LaunchAt): string {
    return [
      metricKey,
      at.stageId ?? "",
      at.priceId ?? "",
      at.sourceId ?? "",
      at.day ?? "",
      at.email ?? "",
    ].join("|");
  }

  get(metricKey: string, at: LaunchAt = {}): number | null {
    return this.byKey.get(LaunchValues.key(metricKey, at)) ?? null;
  }

  get size(): number {
    return this.byKey.size;
  }

  /** The same figures as a plain object the entry form can be handed,
   *  keyed by the name of the box each one belongs in. */
  fields(): LaunchFigures {
    const out: LaunchFigures = {};
    for (const [key, value] of this.byKey) {
      const [metricKey, stageId, priceId, sourceId, day, email] = key.split("|");
      out[
        launchFieldName(metricKey, {
          stageId: stageId || null,
          priceId: priceId || null,
          sourceId: sourceId || null,
          day: day ? Number(day) : null,
          email: email ? Number(email) : null,
        })
      ] = value;
    }
    return out;
  }
}

export interface LaunchDetail {
  launch: LaunchRow;
  stages: LaunchStage[];
  prices: LaunchPrice[];
  sources: LaunchSource[];
  emails: LaunchEmail[];
  values: LaunchValues;
}

/** Every launch this login can see, newest first. */
export async function getLaunches(workspaceId: string): Promise<LaunchRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_launches")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .returns<LaunchRow[]>();

  return data ?? [];
}

/**
 * One launch and everything on it, in four round trips rather than one per
 * field — the shape `getMonthData` uses, for the same reason.
 *
 * Null when the launch does not exist OR cannot be read, and deliberately
 * the same answer for both: §13 says never confirm that another client's
 * record exists.
 */
export async function getLaunch(launchId: string): Promise<LaunchDetail | null> {
  const supabase = await createClient();

  const [launchRes, stageRes, priceRes, sourceRes, emailRes, valueRes] = await Promise.all([
    supabase.from("report_launches").select("*").eq("id", launchId).maybeSingle<LaunchRow>(),
    supabase
      .from("report_launch_stages")
      .select("*")
      .eq("launch_id", launchId)
      .order("position", { ascending: true })
      .returns<LaunchStage[]>(),
    supabase
      .from("report_launch_prices")
      .select("*")
      .eq("launch_id", launchId)
      .order("created_at", { ascending: true })
      .returns<LaunchPrice[]>(),
    supabase
      .from("report_launch_sources")
      .select("*")
      .eq("launch_id", launchId)
      .order("position", { ascending: true })
      .returns<LaunchSource[]>(),
    supabase
      .from("report_launch_emails")
      .select("*")
      .eq("launch_id", launchId)
      // Stage then number, which is the order they went out in and the
      // order the table on the report reads.
      .order("stage_id", { ascending: true })
      .order("number", { ascending: true })
      .returns<LaunchEmail[]>(),
    supabase
      .from("report_launch_values")
      .select("metric_key, stage_id, price_id, source_id, day_number, email_number, value")
      .eq("launch_id", launchId)
      .returns<RawLaunchValue[]>(),
  ]);

  if (!launchRes.data) return null;

  return {
    launch: launchRes.data,
    stages: stageRes.data ?? [],
    prices: priceRes.data ?? [],
    sources: sourceRes.data ?? [],
    emails: emailRes.data ?? [],
    values: new LaunchValues(valueRes.data ?? []),
  };
}

/**
 * What the planner should offer as a conversion rate on a new launch.
 *
 * **Nina's decision 16, changed on 28 October.** The planner used to
 * start both boxes empty, and she asked for one of them to carry
 * something real: the conversion this client actually got last time.
 * Show-up stays empty, deliberately — it swings far more with the
 * audience and the channel than conversion does, and a guessed show-up
 * rate moves the sign-ups figure most.
 *
 * **The most recent finished launch, and only that one.** Not the best,
 * not an average: "what happened last time" is a sentence Nina can
 * finish out loud, and an average across launches of different shapes is
 * not. If that launch has no conversion rate — no selling stage, no
 * sign-ups, no sales — the box starts empty rather than reaching back
 * further for a number nobody asked about.
 *
 * Nothing else is pre-filled, which was the other half of her answer.
 */
export async function suggestedConversionRate(
  workspaceId: string,
): Promise<{ rate: number; from: string } | null> {
  // **Newest by when it was set up.** A launch has no date of its own —
  // the live dates belong to its stages — so `created_at` is the only
  // ordering available without a join, and for launches it is the order
  // they ran in: Nina builds one when she is about to run it. A launch
  // typed up late for a campaign that ran months ago would read as the
  // most recent, which is why the suggestion is named on screen and
  // editable rather than silent.
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("report_launches")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();

  if (!recent) return null;

  const detail = await getLaunch(recent.id);
  if (!detail) return null;

  // Imported here rather than at the top: `launch-figures.ts` takes only
  // types from this module, so the pair has no runtime cycle, and keeping
  // the import beside its one use says which direction the dependency
  // actually runs.
  const { launchSummary } = await import("./launch-figures.ts");
  const rate = launchSummary(detail).conversionRate;
  if (rate === null || !Number.isFinite(rate)) return null;

  // One decimal, the same as every rate this product prints. A planner
  // offering 4.7368421% is offering false precision about a guess.
  return { rate: Math.round(rate * 10) / 10, from: recent.name };
}
