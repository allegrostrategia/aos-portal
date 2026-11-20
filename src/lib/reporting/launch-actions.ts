"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { launchDeleteMessage } from "./launch-delete.ts";
import { launchFieldName } from "./launch-fields.ts";
import { lockedError } from "./locked.ts";
import { withSaved, type SavedKey } from "./saved-notice.ts";
import { getWorkspace } from "./queries.ts";
import { sendLaunchUpdateEmail } from "./launch-send.ts";

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

/**
 * Where a save goes when it worked: back to the screen it came from,
 * with `?saved=` on it so the page can say so.
 *
 * **Not `{ notice }` any more.** A full-suite run under load caught the
 * old way failing — the POST succeeded and the confirmation never
 * appeared, because the form had submitted natively before React
 * attached and the action's return value went with the navigation. The
 * sentence is the page's job now, so it does not depend on hydration.
 *
 * `return_to` comes from the form, so it is checked rather than trusted:
 * only this module's own screens, nothing absolute, no host. Anything
 * else falls back to the launch's own edit screen, which is always a
 * real place to be.
 */
const RETURN_TO = /^\/reporting\/launches\/[0-9a-fA-F-]{36}\/(edit|enter)(\?[^#]*)?$/;

function savedRedirect(formData: FormData, launchId: string, key: SavedKey): never {
  const asked = String(formData.get("return_to") ?? "");
  const href = RETURN_TO.test(asked) ? asked : `/reporting/launches/${launchId}/edit`;
  redirect(withSaved(href, key));
}

/** Null for a box left empty, a number for one filled in. */
function numberOrNull(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const n = Number(text.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const LEAD_TRACKER_REFUSAL =
  "The lead tracker needs to be a link starting http:// or https:// — paste the share link from their sheet.";

/**
 * The lead tracker link, as typed, or null.
 *
 * **Not validated here**, deliberately: the check is a constraint on the
 * column (`report_launches_lead_tracker_is_a_link`), so every writer goes
 * through it — this action, a future import, a hand-typed SQL fix — and
 * not only the form that happens to call this. What this does is the one
 * thing the database cannot: turn "" into null, because an emptied box
 * means "there is no sheet" and a blank string would fail a check that is
 * about links.
 */
function trackerUrl(formData: FormData): string | null {
  return String(formData.get("lead_tracker_url") ?? "").trim() || null;
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
      sign_up_goal_good: numberOrNull(formData.get("sign_up_goal_good")),
      sign_up_goal_better: numberOrNull(formData.get("sign_up_goal_better")),
      sign_up_goal_best: numberOrNull(formData.get("sign_up_goal_best")),
      lead_tracker_url: trackerUrl(formData),
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
    if (/sign_up_goals_ascend/i.test(error.message)) {
      return { error: "The sign-up goals have to go up: good, then better, then best." };
    }
    if (/goals_ascend/i.test(error.message)) {
      return { error: "Good, better and best have to go up in that order." };
    }
    if (/lead_tracker_is_a_link/i.test(error.message)) {
      return { error: LEAD_TRACKER_REFUSAL };
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
      // **`status` is deliberately not here.** It has a form and an
      // action of its own (a disabled field does not submit, so it had
      // to), which means this form never posts one — and defaulting a
      // field that is never sent put every launch back to "planning" on
      // every save. Nothing refused it: the lock exempts status by
      // design, so the guard waved it through too.
      goal_good: numberOrNull(formData.get("goal_good")),
      goal_better: numberOrNull(formData.get("goal_better")),
      goal_best: numberOrNull(formData.get("goal_best")),
      sign_up_goal_good: numberOrNull(formData.get("sign_up_goal_good")),
      sign_up_goal_better: numberOrNull(formData.get("sign_up_goal_better")),
      sign_up_goal_best: numberOrNull(formData.get("sign_up_goal_best")),
      lead_tracker_url: trackerUrl(formData),
      planner_show_up_rate: numberOrNull(formData.get("planner_show_up_rate")),
      planner_conversion_rate: numberOrNull(formData.get("planner_conversion_rate")),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (/sign_up_goals_ascend/i.test(error.message)) {
      return { error: "The sign-up goals have to go up: good, then better, then best." };
    }
    if (/goals_ascend/i.test(error.message)) {
      return { error: "Good, better and best have to go up in that order." };
    }
    if (/lead_tracker_is_a_link/i.test(error.message)) {
      return { error: LEAD_TRACKER_REFUSAL };
    }
    return { error: refused(error, "save that") };
  }
  // Checked, not assumed: an update refused by RLS is not an error, and a
  // silent no-op looks exactly like success.
  if (!data || data.length === 0) {
    return { error: "That launch isn't yours to change." };
  }

  revalidatePath("/reporting/launches", "layout");
  savedRedirect(formData, id, "launch");
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
  savedRedirect(formData, launchId, "stages");
}

/** What a price option's own constraints mean, in the typist's words. */
function priceRefusal(error: { message: string }, name: string): string {
  if (/instalments_positive/i.test(error.message)) {
    return `"${name}" needs a number of months of at least one.`;
  }
  if (/monthly_has_both/i.test(error.message)) {
    return `"${name}" is monthly, so it needs an amount and a number of months.`;
  }
  if (/instalments_pair/i.test(error.message)) {
    return `"${name}" needs both the amount and the number of months, or neither.`;
  }
  return refused(error, "save the prices");
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

    /**
     * **Pay in full, or monthly** (Nina's item 3, 19 November).
     *
     * A monthly option is typed as an amount and a number of months, and
     * `price` is still the full contract value — worked out HERE rather
     * than at read time, so total revenue needs no special case and the
     * stored contract value can never disagree with the two numbers it
     * came from. Which also means the person typing is not asked for a
     * figure they would have to multiply out themselves.
     */
    const monthly = String(at("plan") ?? "full") === "monthly";
    const months = numberOrNull(at("instalments"));
    const perMonth = numberOrNull(at("instalment_amount"));

    let price: number | null;
    if (monthly) {
      if (months === null || perMonth === null) {
        return { error: `"${name}" is monthly, so it needs an amount and a number of months.` };
      }
      price = months * perMonth;
    } else {
      price = numberOrNull(at("price"));
      if (price === null) return { error: `"${name}" needs a price.` };
    }

    const row = {
      launch_id: launchId,
      name,
      price,
      plan: monthly ? "monthly" : "full",
      instalments: months,
      instalment_amount: perMonth,
      is_main: false,
    };

    if (id) {
      keep.add(id);
      const { error } = await supabase.from("report_launch_prices").update(row).eq("id", id);
      if (error) return { error: priceRefusal(error, name) };
    } else {
      const { data, error } = await supabase
        .from("report_launch_prices")
        .insert(row)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) return { error: priceRefusal(error, name) };
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
  savedRedirect(formData, launchId, "prices");
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
const FIGURE_FIELD =
  /^launch:([a-z0-9_]+):([0-9a-f-]+|-):([0-9a-f-]+|-):([0-9a-f-]+|s\d+|-):(\d+|-):(\d+|-)$/;

/** `source:<slot>:name`, `:target`, `:id` — the client's own source list. */
const SOURCE_FIELD = /^source:(\d+):(name|target|id)$/;

/** `email:<stage id>:<number>:sent_on|subject|is_resend` — an email's words. */
const EMAIL_FIELD = /^email:([0-9a-f-]{36}):(\d+):(sent_on|subject|is_resend)$/;

/** Every figure box an email has, so a row is kept when only figures are typed. */
const EMAIL_FIGURES = [
  "launches_email_list_size_sent_to",
  "launches_email_open_rate",
  "launches_email_click_rate",
  "launches_email_unique_clicks",
  "launches_email_clicked_no_sign_up",
] as const;

export async function saveLaunchFigures(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  await requireReportUser();
  const launchId = String(formData.get("launch_id") ?? "");
  if (!launchId) return { error: "That was missing something. Reload and try again." };

  const supabase = await createClient();

  // **The client's own source list goes first, and that is not a tidying
  // choice.** A source and the two figures against it are typed on the
  // same screen and saved by the same button, so a brand-new source has
  // no id at the moment its figure boxes are named — they carry `s<slot>`
  // instead. Writing the rows first is what turns those slots into ids
  // below; doing it afterwards would mean a new source saved with its
  // figures thrown away, every time, on the one save that matters most.
  const sources = await saveSources(supabase, launchId, formData);
  if ("error" in sources) return sources;

  const emails = await saveEmailRows(supabase, launchId, formData);
  if ("error" in emails) return emails;

  const { data: existing } = await supabase
    .from("report_launch_values")
    .select("id, metric_key, stage_id, price_id, source_id, day_number, email_id")
    .eq("launch_id", launchId)
    .returns<
      {
        id: string;
        metric_key: string;
        stage_id: string | null;
        price_id: string | null;
        source_id: string | null;
        day_number: number | null;
        email_id: string | null;
      }[]
    >();

  const slot = (
    metric: string,
    stage: string | null,
    price: string | null,
    source: string | null,
    day: number | null,
    email: string | null,
  ) => [metric, stage ?? "", price ?? "", source ?? "", day ?? "", email ?? ""].join("|");

  const bySlot = new Map(
    (existing ?? []).map((row) => [
      slot(
        row.metric_key,
        row.stage_id,
        row.price_id,
        row.source_id,
        row.day_number,
        row.email_id,
      ),
      row.id,
    ]),
  );

  let saved = 0;
  for (const [field, raw] of formData.entries()) {
    const match = FIGURE_FIELD.exec(field);
    if (!match) continue;

    const [, metric, stageRaw, priceRaw, sourceRaw, dayRaw, emailRaw] = match;
    const stage = stageRaw === "-" ? null : stageRaw;
    const price = priceRaw === "-" ? null : priceRaw;
    const day = dayRaw === "-" ? null : Number(dayRaw);

    // A slot that resolved to nothing is a source whose name was left
    // empty — so the figure beside it has nowhere to go, and is dropped
    // rather than written against the wrong row.
    let source: string | null = null;
    if (sourceRaw !== "-") {
      source = sourceRaw.startsWith("s") ? (sources.slots.get(sourceRaw) ?? null) : sourceRaw;
      if (source === null) continue;
    }

    const value = numberOrNull(raw);

    // **The box is named by the email's number and the figure is stored
    // against its row** (`email_id`, 19 November). A blank email row has
    // no id at the moment its boxes are drawn — the same problem a new
    // source has — so the form sends what a person can see, stage 2,
    // email 3, and `saveEmailRows` above has already turned that into an
    // id for every email anybody said anything about.
    //
    // What is left is a figure for an email with no row at all: an open
    // rate recorded against the fourth email of a sequence nobody has
    // described. That used to store itself anyway, because the key was
    // the number. It still does — the row is created here, empty, as the
    // email it plainly is — because the alternative is a number somebody
    // typed being dropped on the floor, and because `report_launch_emails`
    // is what the email table on the report is drawn from: a figure with
    // no row would be invisible.
    let email: string | null = null;
    if (emailRaw !== "-") {
      const number = Number(emailRaw);
      email = emails.ids.get(`${stage}|${number}`) ?? null;
      if (email === null) {
        // Nothing typed and no row to clear. Not an error: it is the
        // ordinary state of the two spare rows every stage is given.
        if (value === null || !stage) continue;
        const made = await supabase
          .from("report_launch_emails")
          .insert({ launch_id: launchId, stage_id: stage, number })
          .select("id")
          .maybeSingle<{ id: string }>();
        if (made.error) return { error: refused(made.error, "save that") };
        if (!made.data) return { error: "That figure could not be saved — it needs an admin." };
        email = made.data.id;
        emails.ids.set(`${stage}|${number}`, email);
      }
    }

    const id = bySlot.get(slot(metric, stage, price, source, day, email));

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
          source_id: source,
          day_number: day,
          email_id: email,
          value,
        });

    if (error) return { error: refused(error, "save that") };
    saved += 1;
  }

  // Last, now that anything hanging off a removed source has gone.
  const removed = await removeSources(supabase, sources.remove);
  if (removed) return removed;

  revalidatePath("/reporting/launches", "layout");
  savedRedirect(
    formData,
    launchId,
    saved === 0 &&
      !sources.changed &&
      sources.remove.length === 0 &&
      !emails.changed
      ? "nothing"
      : "figures",
  );
}

type Writer = Awaited<ReturnType<typeof createClient>>;

/**
 * The client's own sources: added, renamed, retargeted and removed
 * (Nina's item 6).
 *
 * Slot-numbered rather than id-keyed, the same as the price options and
 * the stages, so a blank row is HTML rather than a button that only
 * works once JavaScript arrives. An emptied name removes the source —
 * and with it, by the foreign key's cascade, the two figures against it.
 *
 * Returns the slot-to-id map the figure loop needs, which is the whole
 * reason this runs first.
 */
async function saveSources(
  supabase: Writer,
  launchId: string,
  formData: FormData,
): Promise<{ slots: Map<string, string>; changed: boolean; remove: { id: string; name: string }[] } | { error: string }> {
  const slots = [...formData.keys()]
    .map((key) => SOURCE_FIELD.exec(key))
    .filter((m): m is RegExpExecArray => m !== null && m[2] === "name")
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

  const map = new Map<string, string>();
  if (slots.length === 0) return { slots: map, changed: false, remove: [] };

  const { data: existing } = await supabase
    .from("report_launch_sources")
    .select("id, name, position")
    .eq("launch_id", launchId)
    .returns<{ id: string; name: string; position: number }[]>();

  const keep = new Set<string>();
  let changed = false;

  for (const slot of slots) {
    const at = (field: string) => formData.get(`source:${slot}:${field}`);
    const name = String(at("name") ?? "").trim();
    const id = String(at("id") ?? "") || null;
    if (name === "") continue;

    const row = {
      launch_id: launchId,
      name,
      // The slot IS the position: the form draws them in order and the
      // order is the client's, so nothing renumbers behind them.
      position: slot,
      sign_up_target: numberOrNull(at("target")),
    };

    if (id) {
      keep.add(id);
      map.set(`s${slot}`, id);
      const { error } = await supabase
        .from("report_launch_sources")
        .update(row)
        .eq("id", id);
      if (error) return { error: sourceRefusal(error, name) };
      changed = true;
    } else {
      const { data, error } = await supabase
        .from("report_launch_sources")
        .insert(row)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) return { error: sourceRefusal(error, name) };
      if (data) {
        keep.add(data.id);
        map.set(`s${slot}`, data.id);
        changed = true;
      }
    }
  }

  /**
   * **Removals are handed back rather than done here**, and the reason
   * is an ordering trap this had on the first pass.
   *
   * A source's figures are `on delete restrict`, so removing one that
   * still has figures is refused and said out loud — right, and the same
   * rule the stages and the prices have. But a stage is removed on a
   * different screen from its figures, while a source and its two
   * figures are on this one. Somebody doing exactly the right thing —
   * clearing both boxes AND emptying the name, in one save — would have
   * been refused, because the delete ran before the figure loop that
   * empties them. Worse, the refusal returned early, so the cleared
   * figures were not saved either and the screen came back unchanged
   * with a message about figures that were no longer there.
   *
   * So the deletes go last, after the figures.
   */
  return {
    slots: map,
    changed,
    remove: (existing ?? []).filter((row) => !keep.has(row.id)),
  };
}

/** The second half of the above, run once the figures have been written. */
async function removeSources(
  supabase: Writer,
  remove: { id: string; name: string }[],
): Promise<LaunchState> {
  for (const row of remove) {
    const { error } = await supabase
      .from("report_launch_sources")
      .delete()
      .eq("id", row.id);
    if (error) {
      return {
        error:
          launchDeleteMessage(error, "source", row.name) ??
          refused(error, "remove a source"),
      };
    }
  }
  return null;
}

function sourceRefusal(error: { message: string }, name: string): string {
  if (/sources_launch_id_name_key|duplicate key/i.test(error.message)) {
    return `There is already a source called "${name}" on this launch.`;
  }
  if (/target_positive/i.test(error.message)) {
    return `"${name}" cannot have a negative target.`;
  }
  return refused(error, "save the sources");
}

/**
 * The words typed about each email — when it went, its subject, whether
 * it was a resend (Nina's item 9).
 *
 * **A row exists when anything about that email does**, including only
 * its figures. The obvious rule — a row when a subject was typed — would
 * have made an email somebody recorded the open rate of but not the
 * subject of invisible in the table, because the table is built from
 * these rows rather than from the figures. So the test is "is any box
 * for this (stage, number) filled", figures included.
 *
 * Returns an error, or whether anything about an email moved — which
 * the save bar needs: somebody who typed only a subject line changed
 * something, and "Nothing had changed" would be a lie about a row that
 * was just written — and the (stage, number) to id map the figure loop
 * keys its open rates by, which is why this runs before it.
 */
async function saveEmailRows(
  supabase: Writer,
  launchId: string,
  formData: FormData,
): Promise<{ changed: boolean; ids: Map<string, string> } | { error: string }> {
  const cells = new Map<
    string,
    { stage: string; number: number; sent_on: string | null; subject: string | null; is_resend: boolean }
  >();

  for (const key of formData.keys()) {
    const match = EMAIL_FIELD.exec(key);
    if (!match) continue;
    const [, stage, numberRaw] = match;
    const number = Number(numberRaw);
    const cellKey = `${stage}|${number}`;
    if (cells.has(cellKey)) continue;
    const at = (field: string) => String(formData.get(`email:${stage}:${number}:${field}`) ?? "").trim();
    cells.set(cellKey, {
      stage,
      number,
      sent_on: at("sent_on") || null,
      subject: at("subject") || null,
      // A checkbox absent from the post is unticked, which is how HTML
      // sends one — so this is the box's presence, not its value.
      is_resend: formData.get(`email:${stage}:${number}:is_resend`) !== null,
    });
  }

  const hasFigure = (stage: string, number: number) =>
    EMAIL_FIGURES.some((metric) => {
      const raw = formData.get(launchFieldName(metric, { stageId: stage, email: number }));
      return raw !== null && String(raw).trim() !== "";
    });

  const { data: existing } = await supabase
    .from("report_launch_emails")
    .select("id, stage_id, number")
    .eq("launch_id", launchId)
    .returns<{ id: string; stage_id: string; number: number }[]>();

  const byCell = new Map((existing ?? []).map((row) => [`${row.stage_id}|${row.number}`, row.id]));

  // Seeded from what is already there, so a screen that sends an email's
  // figures without its words — none does today, but the figure loop
  // should not depend on that — still finds the row to key them by.
  const ids = new Map(byCell);

  // Read after the rows above, not before: `cells` being empty means
  // this save had no email boxes on it at all, which is every screen but
  // the entry form.
  if (cells.size === 0) return { changed: false, ids };

  let changed = false;
  for (const [cellKey, cell] of cells) {
    const said =
      cell.sent_on !== null ||
      cell.subject !== null ||
      cell.is_resend ||
      hasFigure(cell.stage, cell.number);
    const id = byCell.get(cellKey);

    if (!said) {
      if (!id) continue;
      const { data: removed, error } = await supabase
        .from("report_launch_emails")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return { error: refused(error, "remove that email") };
      if (!removed || removed.length === 0) {
        return { error: "That email could not be removed — it needs an admin." };
      }
      // Its figures went with it, by the foreign key's cascade. Which is
      // only safe because `said` counts the figure boxes too: an email
      // whose open rate was typed is never the one being removed.
      ids.delete(cellKey);
      changed = true;
      continue;
    }

    const row = {
      launch_id: launchId,
      stage_id: cell.stage,
      number: cell.number,
      sent_on: cell.sent_on,
      subject: cell.subject,
      is_resend: cell.is_resend,
    };

    if (id) {
      const { error } = await supabase.from("report_launch_emails").update(row).eq("id", id);
      if (error) return { error: refused(error, "save the emails") };
    } else {
      const { data, error } = await supabase
        .from("report_launch_emails")
        .insert(row)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) return { error: refused(error, "save the emails") };
      // Read back rather than assumed: the id is what the figures beside
      // it are about to be keyed by, and an insert RLS refused returns no
      // row and no error. Without this the open rate would be dropped
      // silently on the save that created the email.
      if (data) ids.set(cellKey, data.id);
    }
    changed = true;
  }

  return { changed, ids };
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
 * Telling the client the tracker has moved (Nina's decision 12).
 *
 * A launch's figures carry on arriving for weeks after the cart shuts —
 * cash collected, late sales, the replay's numbers — and until this
 * existed there was no way to say so without waiting for the monthly
 * report. So it is a button, pressed deliberately.
 *
 * **Nothing automatic.** No save sends it, publishing does not send it,
 * and the cron does not know about it. That was the other half of her
 * answer and it is the half worth protecting: a client emailed every time
 * a figure is typed stops reading the emails.
 *
 * Awaited, unlike publishing a month: the button does only this, so the
 * person who pressed it is told what happened rather than finding out
 * from a column later.
 */
export async function sendLaunchUpdate(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can email a client about a launch." };

  const id = String(formData.get("launch_id") ?? "");
  if (!id) return { error: "That was missing something. Reload and try again." };

  // Read as this login first, so a launch they cannot see is refused here
  // rather than by the service role that does the sending. Not found and
  // not theirs are the same answer — §13.
  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("report_launches")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: string }>();
  if (!mine) return { error: "That launch isn't yours to send." };

  const result = await sendLaunchUpdateEmail(id);
  if (!result.ok) return { error: result.error ?? "It didn't go, and gave no reason." };
  return { notice: "Sent. The client has been told the tracker has newer figures in it." };
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
  savedRedirect(formData, id, "status");
}
