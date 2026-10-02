"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireReportUser } from "@/lib/auth/report";
import { categoryByKey, type CategoryKey } from "./categories.ts";
import { getMetrics, getWorkspace } from "./queries.ts";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { isInternalReportPath } from "./paths.ts";
import { canEdit } from "./access.ts";

/**
 * Saving a month's figures.
 *
 * A Server Action is a public endpoint, so nothing here trusts the page that
 * rendered the form: the workspace, the month, the category and every metric
 * key are re-checked, and the write goes through the editor's own session so
 * RLS has the final say. §13 asks for both, and this is the code half — the
 * database refuses the same things independently.
 */

export type SaveState = { error?: string; notice?: string } | null;

/** Form fields carrying a figure are named `v:<metric key>`. */
const FIELD_PREFIX = "v:";

export async function saveCategoryValues(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const categoryKey = String(formData.get("category") ?? "") as CategoryKey;
  const month = firstOfMonth(String(formData.get("month") ?? ""));

  const category = categoryByKey(categoryKey);
  if (!workspaceId || !category || !month) {
    return { error: "That save was missing something. Reload the page and try again." };
  }

  // Readable only if they hold a grant on it, so this doubles as the access
  // check: a workspace they cannot see comes back null.
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    return { error: "You don't have access to that client." };
  }

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });

  if (!mayEdit) {
    // A retainer client viewing their own report. §2: they comment, Allegro
    // enters. The database would refuse this too.
    return { error: "Your report is filled in by your strategist." };
  }

  // Only fields belonging to this category, and only ones that are typed at
  // all — a calculated metric is worked out, never stored (§9), and the
  // database has a trigger saying so.
  const metrics = await getMetrics();
  const writable = new Map(
    metrics
      .filter((m) => m.category === categoryKey)
      .filter((m) => m.input_type === "core" || m.input_type === "optional")
      .map((m) => [m.key, m]),
  );

  const submitted: { key: string; value: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (!field.startsWith(FIELD_PREFIX) || typeof raw !== "string") continue;
    const key = field.slice(FIELD_PREFIX.length);
    if (!writable.has(key)) continue; // Silently ignored, not an error to report.
    submitted.push({ key, value: fromInputValue(raw) });
  }

  if (submitted.length === 0) {
    return { error: "Nothing to save." };
  }

  const supabase = await createClient();

  // Social Media figures belong to a platform (§5.2: "Instagram first; TikTok
  // and LinkedIn added later using the same structure"). Creating the
  // platform on first save rather than leaving the figures at account level
  // means the second platform is a new row and not a backfill of everything
  // entered before it.
  let entityId: string | null = null;
  if (categoryKey === "social_media") {
    entityId = await ensurePrimaryPlatform(workspaceId);
    if (!entityId) {
      return { error: "Couldn't set up the social platform for this client." };
    }
  }

  // The month has to exist as a period before it can be a draft or published.
  // Ignoring a duplicate rather than updating: this must never touch
  // published_at, which is Nina's alone and guarded in the database.
  const { error: periodError } = await supabase
    .from("report_periods")
    .upsert({ workspace_id: workspaceId, month }, {
      onConflict: "workspace_id,month",
      ignoreDuplicates: true,
    });
  if (periodError) {
    return { error: `Couldn't open the month: ${periodError.message}` };
  }

  // Read, then write only what changed.
  //
  // Not a plain upsert: the unique rule is on an EXPRESSION —
  // coalesce(entity_id, …) — because Postgres treats nulls as distinct, and
  // an expression index cannot be named as an ON CONFLICT target by
  // PostgREST. Switching it to a `nulls not distinct` index would make this a
  // single upsert, and is worth doing when a migration is next being reviewed.
  const keys = submitted.map((s) => s.key);
  let existingQuery = supabase
    .from("report_values")
    .select("id, metric_key, value")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .in("metric_key", keys);

  // Scoped to the same entity we are about to write. Without this, a metric
  // that has both an account-level row and a per-platform one would match
  // whichever came back first and the save would update the wrong figure.
  existingQuery = entityId
    ? existingQuery.eq("entity_id", entityId)
    : existingQuery.is("entity_id", null);

  const { data: existingRows, error: readError } = await existingQuery.returns<
    { id: string; metric_key: string; value: number | null }[]
  >();

  if (readError) {
    return { error: `Couldn't read this month's figures: ${readError.message}` };
  }

  const existing = new Map((existingRows ?? []).map((r) => [r.metric_key, r]));

  const inserts = submitted
    .filter((s) => !existing.has(s.key))
    .map((s) => ({
      workspace_id: workspaceId,
      month,
      metric_key: s.key,
      entity_id: entityId,
      value: s.value,
      source: "manual" as const,
      entered_by: reportUser.id,
    }));

  const updates = submitted
    .filter((s) => {
      const row = existing.get(s.key);
      return row !== undefined && row.value !== s.value;
    })
    .map((s) => ({
      id: existing.get(s.key)!.id,
      workspace_id: workspaceId,
      month,
      metric_key: s.key,
      entity_id: entityId,
      value: s.value,
      source: "manual" as const,
      entered_by: reportUser.id,
      entered_at: new Date().toISOString(),
    }));

  if (inserts.length > 0) {
    const { error } = await supabase.from("report_values").insert(inserts);
    if (error) return { error: `Couldn't save: ${error.message}` };
  }

  if (updates.length > 0) {
    // Conflicts on the primary key, named rather than left implicit: an
    // upsert with no target relies on PostgREST choosing it for you, which
    // is true and invisible.
    const { error } = await supabase
      .from("report_values")
      .upsert(updates, { onConflict: "id" });
    if (error) return { error: `Couldn't save: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");

  // "Save & next section" from the approved mockup. Redirecting from the
  // action rather than navigating in the browser means the move only happens
  // once the save has actually landed — a link beside the button would let
  // someone leave a failed save behind them.
  //
  // Checked before use — see paths.ts for what it refuses and why.
  const next = String(formData.get("next") ?? "");
  if (next && isInternalReportPath(next)) {
    redirect(next);
  }

  const changed = inserts.length + updates.length;
  return {
    notice:
      changed === 0
        ? "Nothing had changed."
        : `Saved. ${category.label} is up to date for this month.`,
  };
}


/**
 * The workspace's main social platform, created once.
 *
 * Returns the existing one if there is any — a client who later adds TikTok
 * keeps Instagram as the first, and this picks whichever came first by sort
 * order rather than inventing a second Instagram.
 */
async function ensurePrimaryPlatform(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: found } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "social_platform")
    .order("sort_order")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (found) return found.id;

  const { data: created } = await supabase
    .from("report_entities")
    .insert({
      workspace_id: workspaceId,
      entity_type: "social_platform",
      name: "Instagram",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  return created?.id ?? null;
}
