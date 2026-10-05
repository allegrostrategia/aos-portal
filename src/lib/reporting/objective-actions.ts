"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";
import type { NoteState } from "./note-actions.ts";

/**
 * "What we're focusing on next month" — §8's up-to-three objectives.
 *
 * Written by Nina or by an assigned team member, which is what the database
 * already allowed and what Nina confirmed on 5 October: Elize drafts them
 * with everything else and Nina adjusts before publishing, exactly as with
 * the notes. A client never writes one, and never reads one until the month
 * is published — both enforced by RLS, not by this file.
 *
 * "Up to three" is the database's rule, not the form's: a partial unique
 * index on (workspace, month, position) refuses a fourth outright. So the
 * three boxes below are three *positions*, not three rows this code counts.
 *
 * **An emptied objective is stored empty, not deleted.** There is no delete
 * policy on `report_notes` for anyone but an admin — deliberately, and rule 7
 * is why — so a team member clearing one would otherwise be refused in
 * silence. An empty objective renders as nothing, which is the behaviour
 * anybody emptying a box is asking for, and the row stays where it was.
 */
export async function saveObjectives(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) {
    return { error: "That was missing something. Reload and try again." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayWrite = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayWrite) {
    return { error: "Only your strategist sets next month's focus." };
  }

  const authorName = grant?.display_name ?? reportUser.name ?? "Allegro Strategia";
  const supabase = await createClient();

  // Every objective already on this month, whoever wrote it. Positions are
  // shared: if Elize wrote number two, Nina adjusts that row rather than
  // adding a second number two, which the unique index would refuse anyway.
  const { data: existing } = await supabase
    .from("report_notes")
    .select("id, position, author_id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("note_type", "objective")
    .returns<{ id: string; position: number; author_id: string | null }[]>();

  const byPosition = new Map((existing ?? []).map((row) => [row.position, row]));

  for (const position of [1, 2, 3] as const) {
    const body = String(formData.get(`objective_${position}`) ?? "").trim();
    const row = byPosition.get(position);

    if (row) {
      if (row.author_id !== reportUser.id && !reportUser.isAdmin) {
        // RLS would refuse this update, and a refusal the person cannot see
        // is worse than a sentence telling them why. Only reached when two
        // team members share a client.
        if (body !== "") {
          return {
            error: `Objective ${position} was written by somebody else. Nina can change it; you can't.`,
          };
        }
        continue;
      }
      const { error } = await supabase
        .from("report_notes")
        .update({ body })
        .eq("id", row.id);
      if (error) return { error: `Couldn't save objective ${position}: ${error.message}` };
      continue;
    }

    // Nothing there and nothing typed: no empty row for the sake of it.
    if (body === "") continue;

    const { error } = await supabase.from("report_notes").insert({
      workspace_id: workspaceId,
      month,
      category: null,
      note_type: "objective",
      author_id: reportUser.id,
      author_name: authorName,
      body,
      position,
    });
    if (error) return { error: `Couldn't save objective ${position}: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Next month's focus saved." };
}
