"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";
import type { TopItemType } from "./top-items.ts";

/**
 * The top three hooks and the top three b-roll clips (§5.3).
 *
 * Not figures, so not `report_values`: each one is a line of text with a
 * view count, and its own table enforces the "three" — a partial unique
 * index on (workspace, month, type, rank) and a check that the rank is
 * 1, 2 or 3.
 *
 * All six in one save, for the reason the Offers month is one save:
 * somebody filling this in is reading down a list, and six saves is six
 * chances to leave one behind.
 *
 * **An emptied line is removed, not stored blank.** Here that is a
 * delete, and it is the one place in the reporting tool where one is
 * right: rule 7 is about not losing a client's record, and a hook
 * somebody typed into the wrong row is not a record of anything. The
 * month's figures are untouched either way.
 */

export type TopItemState = { error?: string; notice?: string } | null;

/** `item:<type>:<rank>:body` and `item:<type>:<rank>:views`. */
const FIELD = /^item:(hook|b_roll):([123]):(body|views)$/;

export async function saveTopItems(
  _prev: TopItemState,
  formData: FormData,
): Promise<TopItemState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) return { error: "That was missing something." };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayEdit) return { error: "Your report is filled in by your strategist." };

  const rows = new Map<string, { type: TopItemType; rank: number; body: string; views: number | null }>();
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = FIELD.exec(field);
    if (!match) continue;
    const [, type, rankRaw, part] = match;
    const rank = Number(rankRaw);
    const key = `${type}:${rank}`;
    const row = rows.get(key) ?? {
      type: type as TopItemType,
      rank,
      body: "",
      views: null,
    };
    if (part === "body") row.body = raw.trim();
    else row.views = fromInputValue(raw);
    rows.set(key, row);
  }

  if (rows.size === 0) return { error: "Nothing to save." };

  const supabase = await createClient();

  // The month has to exist before anything hangs off it, same as the
  // figures do.
  const { error: periodError } = await supabase
    .from("report_periods")
    .upsert({ workspace_id: workspaceId, month }, {
      onConflict: "workspace_id,month",
      ignoreDuplicates: true,
    });
  if (periodError) return { error: `Couldn't open the month: ${periodError.message}` };

  const { data: existingRows, error: readError } = await supabase
    .from("report_top_items")
    .select("id, item_type, rank")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .returns<{ id: string; item_type: TopItemType; rank: number }[]>();

  if (readError) return { error: `Couldn't read this month: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((row) => [`${row.item_type}:${row.rank}`, row.id]),
  );

  for (const [key, row] of rows) {
    const id = existing.get(key);

    if (row.body === "") {
      if (!id) continue;
      // **Checked, not assumed.** A delete that matches no row under RLS
      // is not an error, so without reading back what went, somebody
      // without the delete policy would be told "Saved" and find the
      // line still there. See 20261006180000 for the policy itself.
      const { data: removed, error } = await supabase
        .from("report_top_items")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return { error: `Couldn't clear that line: ${error.message}` };
      if (!removed || removed.length === 0) {
        return {
          error:
            "That line could not be cleared — it needs an admin. Everything else was saved.",
        };
      }
      continue;
    }

    const { error } = id
      ? await supabase
          .from("report_top_items")
          .update({ body: row.body, views: row.views })
          .eq("id", id)
      : await supabase.from("report_top_items").insert({
          workspace_id: workspaceId,
          month,
          item_type: row.type,
          rank: row.rank,
          body: row.body,
          views: row.views,
        });

    if (error) return { error: `Couldn't save that line: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved. Trial Reels is up to date for this month." };
}
