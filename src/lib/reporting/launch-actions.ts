"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { launchDeleteMessage } from "./launch-delete.ts";
import { lockedError } from "./locked.ts";
import { getWorkspace } from "./queries.ts";

/**
 * Setting a launch up, and typing its figures in (§6.1 to §6.5).
 *
 * Almost nothing is enforced here, because it is all enforced below:
 *
 *   · RLS admits a write only on a workspace this login may edit, so a
 *     retainer client cannot touch one at all.
 *   · `guard_report_launch_publish` keeps publishing to Nina.
 *   · `guard_report_published_launch` refuses every write — figures,
 *     stages and prices — once a launch has gone out, so a correction
 *     goes unpublish → fix → republish like a month's.
 *   · `guard_report_launch_value` refuses a figure that is not a launch
 *     metric, in the context it does not belong to.
 *
 * This file's job is the wording when one of those refuses, and the one
 * thing the database cannot know: which fields a form meant to send.
 */

export type LaunchState = { error?: string; notice?: string } | null;

/** The refusal everything here shares, said once. */
function refused(error: { message: string }, verb: string): string {
  return lockedError(error) ?? `Couldn't ${verb}: ${error.message}`;
}

/** Null for a box left empty, a number for one filled in. */
function numberOrNull(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const n = Number(text.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function createLaunch(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  const reportUser = await requireReportUser();
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!workspaceId) return { error: "That was missing something. Reload and try again." };
  if (name === "") return { error: "A launch needs a name before anything else." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_launches")
    .insert({
      workspace_id: workspaceId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      offer_entity_id: String(formData.get("offer_entity_id") ?? "") || null,
      goal_good: numberOrNull(formData.get("goal_good")),
      goal_better: numberOrNull(formData.get("goal_better")),
      goal_best: numberOrNull(formData.get("goal_best")),
      planner_show_up_rate: numberOrNull(formData.get("planner_show_up_rate")),
      planner_conversion_rate: numberOrNull(formData.get("planner_conversion_rate")),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    // The one constraint somebody will meet by accident, said in their
    // own terms rather than as an index name.
    if (/report_launches_name_key|duplicate key/i.test(error.message)) {
      return { error: `There is already a launch called "${name}" for this client.` };
    }
    if (/goals_ascend/i.test(error.message)) {
      return { error: "Good, better and best have to go up in that order." };
    }
    return { error: refused(error, "create that launch") };
  }
  if (!data) return { error: "Couldn't create that launch." };

  void reportUser;
  revalidatePath("/reporting/launches", "layout");
  redirect(`/reporting/launches/${data.id}/edit?workspace=${workspaceId}`);
}

/**
 * The launch's own fields, after it exists.
 *
 * Separate from `createLaunch` because the shapes genuinely differ: a new
 * launch has no id and must not carry a status, and an existing one may
 * change its status even once published — the one field the lock leaves
 * alone, since it describes the launch rather than the report.
 */
export async function updateLaunch(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const id = String(formData.get("launch_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { error: "That was missing something. Reload and try again." };
  if (name === "") return { error: "A launch needs a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_launches")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      offer_entity_id: String(formData.get("offer_entity_id") ?? "") || null,
      status: String(formData.get("status") ?? "planning"),
      goal_good: numberOrNull(formData.get("goal_good")),
      goal_better: numberOrNull(formData.get("goal_better")),
      goal_best: numberOrNull(formData.get("goal_best")),
      planner_show_up_rate: numberOrNull(formData.get("planner_show_up_rate")),
      planner_conversion_rate: numberOrNull(formData.get("planner_conversion_rate")),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (/goals_ascend/i.test(error.message)) {
      return { error: "Good, better and best have to go up in that order." };
    }
    return { error: refused(error, "save that") };
  }
  // Checked, not assumed: an update refused by RLS is not an error, and a
  // silent no-op looks exactly like success.
  if (!data || data.length === 0) {
    return { error: "That launch isn't yours to change." };
  }

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Saved." };
}

/**
 * The stages, in order, in one save (§6.1).
 *
 * All of them together for the reason the Offers month is one save:
 * somebody filling this in is reading down a list, and five saves is five
 * chances to leave one behind. An emptied name removes that stage.
 */
export async function saveStages(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const launchId = String(formData.get("launch_id") ?? "");
  if (!launchId) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("report_launch_stages")
    .select("id, position, name")
    .eq("launch_id", launchId)
    .returns<{ id: string; position: number; name: string }[]>();

  const byPosition = new Map((existing ?? []).map((row) => [row.position, row]));
  const main = Number(String(formData.get("main_stage") ?? "0"));

  // Positions are read from the form rather than counted, so a gap left by
  // a removed stage does not silently renumber the ones after it.
  const positions = [...formData.keys()]
    .map((key) => /^stage:(\d+):name$/.exec(key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);

  for (const position of positions) {
    const at = (field: string) => formData.get(`stage:${position}:${field}`);
    const name = String(at("name") ?? "").trim();
    const stored = byPosition.get(position);
    const id = stored?.id;

    if (name === "") {
      if (!id) continue;
      const { data: removed, error } = await supabase
        .from("report_launch_stages")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) {
        return {
          // Its STORED name, not the form's: the form's is empty, because
          // emptying it is how a stage is removed.
          error:
            launchDeleteMessage(error, "stage", stored?.name ?? "That stage") ??
            refused(error, "remove that stage"),
        };
      }
      if (!removed || removed.length === 0) {
        return { error: "That stage could not be removed — it needs an admin." };
      }
      continue;
    }

    const row = {
      launch_id: launchId,
      position,
      name,
      stage_type: String(at("type") ?? "other"),
      promo_start: String(at("promo_start") ?? "") || null,
      promo_end: String(at("promo_end") ?? "") || null,
      live_start: String(at("live_start") ?? "") || null,
      live_end: String(at("live_end") ?? "") || null,
      live_days: numberOrNull(at("live_days")),
      sign_up_goal: numberOrNull(at("sign_up_goal")),
      attendance_goal: numberOrNull(at("attendance_goal")),
      // Set in a second pass below: only one stage may carry it, and
      // Postgres enforces that with a unique index, so turning the new
      // one on before the old one off is refused.
      is_main_selling_stage: false,
    };

    const { error } = id
      ? await supabase.from("report_launch_stages").update(row).eq("id", id)
      : await supabase.from("report_launch_stages").insert(row);

    if (error) {
      if (/dates_order/i.test(error.message)) {
        return { error: `"${name}" ends before it starts. Check its dates.` };
      }
      return { error: refused(error, "save the stages") };
    }
  }

  // The main selling stage, after every row exists and with the old one
  // cleared first — the unique index refuses two, so the order matters.
  const { error: clearError } = await supabase
    .from("report_launch_stages")
    .update({ is_main_selling_stage: false })
    .eq("launch_id", launchId)
    .eq("is_main_selling_stage", true);
  if (clearError) return { error: refused(clearError, "save the stages") };

  if (main > 0) {
    const { error: setError } = await supabase
      .from("report_launch_stages")
      .update({ is_main_selling_stage: true })
      .eq("launch_id", launchId)
      .eq("position", main);
    if (setError) return { error: refused(setError, "set the selling stage") };
  }

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Saved." };
}

/** The price options, in one save (§6.1). An emptied name removes one. */
export async function savePrices(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const launchId = String(formData.get("launch_id") ?? "");
  if (!launchId) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("report_launch_prices")
    .select("id, name")
    .eq("launch_id", launchId)
    .returns<{ id: string; name: string }[]>();

  const slots = [...formData.keys()]
    .map((key) => /^price:(\d+):name$/.exec(key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);

  const main = Number(String(formData.get("main_price") ?? "0"));
  const keep = new Set<string>();

  for (const slot of slots) {
    const at = (field: string) => formData.get(`price:${slot}:${field}`);
    const name = String(at("name") ?? "").trim();
    const id = String(at("id") ?? "") || null;
    if (name === "") continue;

    const price = numberOrNull(at("price"));
    if (price === null) return { error: `"${name}" needs a price.` };

    const row = {
      launch_id: launchId,
      name,
      price,
      instalments: numberOrNull(at("instalments")),
      instalment_amount: numberOrNull(at("instalment_amount")),
      is_main: false,
    };

    if (id) {
      keep.add(id);
      const { error } = await supabase.from("report_launch_prices").update(row).eq("id", id);
      if (error) return { error: refused(error, "save the prices") };
    } else {
      const { data, error } = await supabase
        .from("report_launch_prices")
        .insert(row)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) return { error: refused(error, "save the prices") };
      if (data) keep.add(data.id);
    }
  }

  // Anything the form no longer carries was emptied.
  for (const row of existing ?? []) {
    if (keep.has(row.id)) continue;
    const { error } = await supabase.from("report_launch_prices").delete().eq("id", row.id);
    if (error) {
      return {
        error:
          launchDeleteMessage(error, "price option", row.name) ??
          refused(error, "remove a price option"),
      };
    }
  }

  const { error: clearError } = await supabase
    .from("report_launch_prices")
    .update({ is_main: false })
    .eq("launch_id", launchId)
    .eq("is_main", true);
  if (clearError) return { error: refused(clearError, "save the prices") };

  if (main > 0) {
    const names = [...slots].map((slot) => String(formData.get(`price:${slot}:name`) ?? "").trim());
    const mainName = names[main - 1];
    if (mainName) {
      const { error } = await supabase
        .from("report_launch_prices")
        .update({ is_main: true })
        .eq("launch_id", launchId)
        .eq("name", mainName);
      if (error) return { error: refused(error, "set the main price") };
    }
  }

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Saved." };
}

/**
 * The figures, in one save per screen (§6.2 to §6.5).
 *
 * Every box is `launch:<metric key>:<stage|->:<price|->:<day|->:<email|->`,
 * so one parser handles all four of the contexts a launch figure can hang
 * off and the form decides which it is sending. A key shaped any other way
 * is ignored rather than guessed at — §13's rule that nothing is inferred
 * from a field name.
 *
 * An emptied box removes the figure, the same as everywhere: a stored zero
 * and a box nobody filled in are different things, and §4's dash depends
 * on the difference.
 */
const FIGURE_FIELD = /^launch:([a-z0-9_]+):([0-9a-f-]+|-):([0-9a-f-]+|-):(\d+|-):(\d+|-)$/;

export async function saveLaunchFigures(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const launchId = String(formData.get("launch_id") ?? "");
  if (!launchId) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("report_launch_values")
    .select("id, metric_key, stage_id, price_id, day_number, email_number")
    .eq("launch_id", launchId)
    .returns<
      {
        id: string;
        metric_key: string;
        stage_id: string | null;
        price_id: string | null;
        day_number: number | null;
        email_number: number | null;
      }[]
    >();

  const slot = (
    metric: string,
    stage: string | null,
    price: string | null,
    day: number | null,
    email: number | null,
  ) => [metric, stage ?? "", price ?? "", day ?? "", email ?? ""].join("|");

  const bySlot = new Map(
    (existing ?? []).map((row) => [
      slot(row.metric_key, row.stage_id, row.price_id, row.day_number, row.email_number),
      row.id,
    ]),
  );

  let saved = 0;
  for (const [field, raw] of formData.entries()) {
    const match = FIGURE_FIELD.exec(field);
    if (!match) continue;

    const [, metric, stageRaw, priceRaw, dayRaw, emailRaw] = match;
    const stage = stageRaw === "-" ? null : stageRaw;
    const price = priceRaw === "-" ? null : priceRaw;
    const day = dayRaw === "-" ? null : Number(dayRaw);
    const email = emailRaw === "-" ? null : Number(emailRaw);

    const value = numberOrNull(raw);
    const id = bySlot.get(slot(metric, stage, price, day, email));

    if (value === null) {
      if (!id) continue;
      // Checked, not assumed: a delete matching no row under RLS is not
      // an error, so without reading back what went, somebody without the
      // right would be told "Saved" and find the figure still there.
      const { data: removed, error } = await supabase
        .from("report_launch_values")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return { error: refused(error, "clear that figure") };
      if (!removed || removed.length === 0) {
        return { error: "A figure could not be cleared — it needs an admin." };
      }
      saved += 1;
      continue;
    }

    const { error } = id
      ? await supabase.from("report_launch_values").update({ value }).eq("id", id)
      : await supabase.from("report_launch_values").insert({
          launch_id: launchId,
          metric_key: metric,
          stage_id: stage,
          price_id: price,
          day_number: day,
          email_number: email,
          value,
        });

    if (error) return { error: refused(error, "save that") };
    saved += 1;
  }

  revalidatePath("/reporting/launches", "layout");
  return { notice: saved === 0 ? "Nothing to save." : "Saved." };
}

/**
 * Publishing a launch, and taking it back (§6).
 *
 * Nina's alone, the same as a month — `guard_report_launch_publish` has
 * refused a team member since 30 September, and this is the wording when
 * it does.
 *
 * **No email.** Publishing a month emails the client a link; a launch
 * does not, and the next monthly report is where it gets mentioned. One
 * email a month rather than two — Nina's decision 10.
 *
 * What it freezes: the offer's name, which is the one thing on the page
 * that belongs to the workspace rather than to the launch. Rename
 * "Signature programme" afterwards and the published report would
 * otherwise quietly say something else.
 */
export async function publishLaunch(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can publish a launch report." };

  const id = String(formData.get("launch_id") ?? "");
  if (!id) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();
  const { data: launch } = await supabase
    .from("report_launches")
    .select("offer_entity_id")
    .eq("id", id)
    .maybeSingle<{ offer_entity_id: string | null }>();

  let offerName: string | null = null;
  if (launch?.offer_entity_id) {
    const { data: offer } = await supabase
      .from("report_entities")
      .select("name")
      .eq("id", launch.offer_entity_id)
      .maybeSingle<{ name: string }>();
    offerName = offer?.name ?? null;
  }

  const { data, error } = await supabase
    .from("report_launches")
    .update({
      published_at: new Date().toISOString(),
      published_by: reportUser.id,
      carried: offerName ? { offerName } : {},
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: `Couldn't publish: ${error.message}` };
  if (!data || data.length === 0) return { error: "That launch isn't yours to publish." };

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Published. The client can see this launch now." };
}

export async function unpublishLaunch(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can unpublish a launch report." };

  const id = String(formData.get("launch_id") ?? "");
  if (!id) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_launches")
    .update({ published_at: null, published_by: null })
    .eq("id", id)
    .select("id");

  if (error) return { error: `Couldn't unpublish: ${error.message}` };
  if (!data || data.length === 0) return { error: "That launch isn't yours to unpublish." };

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Back to draft. The client can no longer see this launch." };
}

/**
 * The status, on its own (§6, Nina's decision 15).
 *
 * Its own action and its own form, because **a disabled field does not
 * submit**. On a published launch every other box is disabled, so the
 * main form would arrive carrying a status and nothing else — and be
 * refused for having no name. Separating them means the one field the
 * lock leaves alone behaves the same whether the launch is out or not.
 */
export async function updateLaunchStatus(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const id = String(formData.get("launch_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["planning", "live", "completed"].includes(status)) {
    return { error: "That was missing something. Reload and try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_launches")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) return { error: refused(error, "save the status") };
  if (!data || data.length === 0) return { error: "That launch isn't yours to change." };

  revalidatePath("/reporting/launches", "layout");
  return { notice: "Status saved." };
}
