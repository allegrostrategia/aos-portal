"use server";

import { revalidatePath } from "next/cache";

import { canEdit } from "./access.ts";
import { getWorkspace } from "./queries.ts";
import { lockedError } from "./locked.ts";
import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";

/**
 * A member's own reflection on their month (§8).
 *
 * The counterpart to the strategist note, and deliberately a different
 * note type rather than the same one written by somebody else: a member
 * filing "a note from your strategist" about themselves is not a thing
 * this product has, and `canWriteStrategistNote` already refuses it.
 *
 * **Not a retainer client's.** `canEdit` is false for them by design —
 * they get the reply box instead, which is a conversation with Nina. A
 * reflection is a private note to yourself about your own figures.
 *
 * The database holds the same rule independently: `report_notes_write`
 * falls through to `report_can_edit(workspace_id)` for every type that
 * is not a strategist note or a client reply.
 */

export type ReflectionState = { error?: string; notice?: string } | null;

export async function saveReflection(
  _prev: ReflectionState,
  formData: FormData,
): Promise<ReflectionState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = String(formData.get("month") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!workspaceId || !month) {
    return { error: "That was missing something. Reload and try again." };
  }
  if (body === "") return { error: "There's nothing written to save." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that report." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayWrite = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayWrite) return { error: "This one isn't yours to write." };

  const supabase = await createClient();

  // One reflection per person per month, so saving again edits it. The
  // Overview note is the one with no category, which is `is null` rather
  // than `eq null` — PostgREST turns the latter into a comparison that
  // never matches, and every save would add another note.
  const { data: mine } = await supabase
    .from("report_notes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("note_type", "reflection")
    .eq("author_id", reportUser.id)
    .is("category", null)
    .maybeSingle<{ id: string }>();

  const failed = (error: { message: string }) => ({
    error: lockedError(error) ?? `Couldn't save that: ${error.message}`,
  });

  if (mine) {
    const { error } = await supabase.from("report_notes").update({ body }).eq("id", mine.id);
    if (error) return failed(error);
  } else {
    const { error } = await supabase.from("report_notes").insert({
      workspace_id: workspaceId,
      month,
      category: null,
      note_type: "reflection",
      author_id: reportUser.id,
      // `set_report_note_author_name` overwrites this from the grant, so
      // nobody can sign as somebody else. Sent because the column is NOT
      // NULL, not because it is trusted.
      author_name: grant?.display_name ?? reportUser.name ?? "",
      body,
    });
    if (error) return failed(error);
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}
