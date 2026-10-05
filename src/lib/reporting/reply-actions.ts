"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";
import type { NoteState } from "./note-actions.ts";

/**
 * §8's "comment box so the client can respond to the report".
 *
 * A client may reply more than once on a month — Nina's decision of
 * 5 October — so a report can become a short conversation rather than one
 * box they get a single go at. Oldest first, each one dated.
 *
 * Almost nothing is enforced here, because it is all enforced below:
 *
 *   · RLS admits an insert only on a month this login can actually read, so
 *     a client cannot reply to a draft, and cannot reply as somebody else.
 *   · The update policy admits the author alone, so they revise their own
 *     words and nobody else's.
 *   · There is no delete policy for them at all. A reply, once sent, stays.
 *   · A guard trigger refuses any attempt to edit a reply into a different
 *     month, section, or kind of note — the column-ownership trap, which has
 *     caught this codebase three times. Without it a client could turn their
 *     own reply into a note from their strategist.
 *
 * This file's job is the wording when one of those refuses.
 */

export async function addClientReply(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const body = String(formData.get("body") ?? "").trim();

  if (!workspaceId || !month) {
    return { error: "That was missing something. Reload and try again." };
  }
  if (body === "") return { error: "There's nothing written to send." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that report." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const authorName = grant?.display_name ?? reportUser.name ?? "The client";

  const supabase = await createClient();
  const { error } = await supabase.from("report_notes").insert({
    workspace_id: workspaceId,
    month,
    category: null,
    note_type: "client_reply",
    author_id: reportUser.id,
    author_name: authorName,
    body,
  });

  if (error) {
    // The policy refuses an unpublished month, which from the client's side
    // is "this month isn't out yet" rather than a permissions problem.
    return {
      error: /policy|denied/i.test(error.message)
        ? "This month's report isn't published yet, so there's nothing to reply to."
        : `Couldn't send that: ${error.message}`,
    };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Sent. Your strategist will see it with the report." };
}

/**
 * Revising a reply already sent.
 *
 * Their own only — RLS, again. Kept because the alternative is a typo in
 * something a client sent their strategist that they can never fix, and
 * because editing prose is not deleting a record (rule 7).
 */
export async function editClientReply(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  const noteId = String(formData.get("note_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!noteId) return { error: "That was missing something. Reload and try again." };
  if (body === "") {
    // No "delete by emptying": a reply cannot be withdrawn, and an empty one
    // pretending to be gone would be exactly that with extra steps.
    return { error: "A reply can be reworded, but not emptied." };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("report_notes")
    .update({ body })
    .eq("id", noteId)
    .eq("author_id", reportUser.id)
    .eq("note_type", "client_reply")
    .select("id");

  if (error) return { error: `Couldn't save that: ${error.message}` };

  // RLS returning no row and the note not existing are the same answer from
  // here, and both mean the same thing to whoever asked: not yours.
  if (!updated || (updated as { id: string }[]).length === 0) {
    return { error: "That reply isn't yours to change." };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}
