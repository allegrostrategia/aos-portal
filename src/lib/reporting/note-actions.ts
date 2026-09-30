"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { categoryByKey } from "./categories.ts";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";

/**
 * Notes, and publishing.
 *
 * §8: "Written words come from people, never generated." Nothing in this
 * file or anything it calls goes near an AI (CLAUDE.md rule 2).
 */

export type NoteState = { error?: string; notice?: string } | null;

/**
 * Write or revise a strategist note.
 *
 * An author edits their own note for that month and category, and creates
 * one if they have none. Not "the" note for the month: §8 has observations
 * coming from Elize *or* Nina, and a single shared row would mean one of them
 * silently overwriting the other. RLS agrees — the update policy admits the
 * author only.
 */
export async function saveStrategistNote(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const categoryRaw = String(formData.get("category") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  // Null category is the Overview note; anything else must be a real one.
  const category = categoryRaw === "" ? null : categoryByKey(categoryRaw)?.key;
  if (!workspaceId || !month || (categoryRaw !== "" && !category)) {
    return { error: "That note was missing something. Reload and try again." };
  }

  if (body === "") {
    return { error: "There's nothing written to save." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const isTeam = reportUser.isAdmin || grant?.role === "team";
  if (!isTeam) {
    // §8's table: for an aOS member the equivalent is their own reflection,
    // which is a different note type and a different screen.
    return { error: "Only your strategist writes this note." };
  }

  const authorName =
    grant?.display_name ?? reportUser.name ?? "Allegro Strategia";

  const supabase = await createClient();

  // The Overview note is the one with no category, which is `is null` and
  // not `eq null` — PostgREST would turn the latter into a comparison that
  // never matches, and every save would insert another note.
  let mineQuery = supabase
    .from("report_notes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("note_type", "strategist")
    .eq("author_id", reportUser.id);

  mineQuery = category
    ? mineQuery.eq("category", category)
    : mineQuery.is("category", null);

  const { data: mine } = await mineQuery.maybeSingle<{ id: string }>();

  if (mine) {
    const { error } = await supabase
      .from("report_notes")
      .update({ body })
      .eq("id", mine.id);
    if (error) return { error: `Couldn't save the note: ${error.message}` };
  } else {
    const { error } = await supabase.from("report_notes").insert({
      workspace_id: workspaceId,
      month,
      category,
      note_type: "strategist",
      author_id: reportUser.id,
      author_name: authorName,
      body,
    });
    if (error) return { error: `Couldn't save the note: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Note saved." };
}

/**
 * Publish a month.
 *
 * Nina's alone, decided 30 September 2026. Checked here and refused
 * independently by a guard trigger in the database, which covers the insert
 * as well as the update.
 *
 * Not yet built, and deliberately not faked: §8 says "The client is emailed
 * when it's published". Nothing here sends that email. A retainer client has
 * no `members` row, so their address lives in `auth.users` and needs the
 * service role to read — a real piece of work rather than a line, and better
 * done properly than half-done behind a button that claims it happened.
 */
export async function publishMonth(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  if (!reportUser.isAdmin) {
    return { error: "Only Nina can publish a report." };
  }

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) {
    return { error: "That was missing something. Reload and try again." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("report_periods")
    .upsert(
      {
        workspace_id: workspaceId,
        month,
        published_at: new Date().toISOString(),
        published_by: reportUser.id,
      },
      { onConflict: "workspace_id,month" },
    );

  if (error) return { error: `Couldn't publish: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return {
    notice: "Published. The client can see this month now — send them a note to say so.",
  };
}

/**
 * Take a month back to draft.
 *
 * Kept because publishing a month with a wrong figure in it is a thing that
 * will happen, and the alternative to an unpublish button is editing the
 * database by hand. Admin only, same as publishing.
 */
export async function unpublishMonth(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can unpublish a report." };

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) return { error: "That was missing something." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("report_periods")
    .update({ published_at: null, published_by: null })
    .eq("workspace_id", workspaceId)
    .eq("month", month);

  if (error) return { error: `Couldn't unpublish: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return { notice: "Back to draft. The client can no longer see this month." };
}
