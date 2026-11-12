"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import type { SalesState } from "./sales-actions.ts";

/**
 * Who does the work, and whose hours went on which client.
 *
 * **The rate is never sent from here.** `guard_report_client_hours_rows`
 * reads it off the staff member and holds it still on every later edit,
 * so September costs what September cost whatever anybody is paid now.
 * An app that sent a rate would be a second answer to that question.
 */

async function editableWorkspace(workspaceId: string) {
  const reportUser = await requireReportUser();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." } as const;

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });

  if (!mayEdit) return { error: "Your report is filled in by your Allegro team." } as const;
  return { reportUser, workspace } as const;
}

/** A guard's wording, turned into something a person can act on. */
function explain(message: string, fallback: string): string {
  if (/that month is published/i.test(message)) {
    return "That month is published, so its figures are fixed. Unpublish it to make changes.";
  }
  if (/against a client row/i.test(message)) {
    return "Hours go against a client. An offer's hours are asked for on the Offers screen.";
  }
  if (/duplicate key|unique/i.test(message)) return fallback;
  return `${fallback} ${message}`;
}

/**
 * Add someone, change their name or rate, or retire them.
 *
 * **Changing a rate is forward-looking**, which is the whole reason
 * `rate_used` is captured per row: the hours already saved keep what
 * they cost, and the new rate applies to the next ones. Said on the
 * screen too, because a rate change that silently rewrote a published
 * month would be the worst kind of quiet.
 */
export async function saveStaff(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("staff_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const rate = fromInputValue(String(formData.get("hourly_rate") ?? ""));
  const retire = String(formData.get("retire") ?? "");

  const supabase = await createClient();

  if (id && retire) {
    const active = retire === "no";
    const { error } = await supabase.from("report_staff").update({ active }).eq("id", id);
    if (error) return { error: explain(error.message, "Couldn't change that person.") };
    revalidatePath("/reporting", "layout");
    return { notice: active ? `${name} is back on the team.` : `${name} retired.` };
  }

  if (!name) return { error: "A person needs a name." };
  if (rate === null || rate <= 0) {
    return { error: "An hourly rate is what their time costs — more than nothing." };
  }

  const fields = { workspace_id: workspaceId, name, hourly_rate: rate };
  const { error } = id
    ? await supabase.from("report_staff").update(fields).eq("id", id)
    : await supabase.from("report_staff").insert({
        ...fields,
        sort_order: await nextSortOrder(supabase, workspaceId),
      });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already somebody called "${name}".` };
    }
    return { error: explain(error.message, "Couldn't save that person.") };
  }

  revalidatePath("/reporting", "layout");
  return {
    notice: id
      ? `${name} saved. The hours already entered keep the rate they were saved with.`
      : `${name} added.`,
  };
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<number> {
  const { data } = await supabase
    .from("report_staff")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .returns<{ sort_order: number }[]>();
  return (data?.[0]?.sort_order ?? 0) + 1;
}

/** A cell, posted as `hours:<client row id>:<staff id>`. */
const CELL = /^hours:([0-9a-f-]{36}):([0-9a-f-]{36})$/;

/**
 * One month's hours, the whole grid in one save.
 *
 * **One month, not a year.** Every other grid on this screen is rows
 * against months; this one is clients against people, for the month
 * being entered — which is the shape the question has, because the
 * third dimension is who did the work.
 */
export async function saveClientHours(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(month)) return { error: "Which month is this?" };

  const posted: { sales_row_id: string; staff_id: string; hours: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    const match = CELL.exec(field);
    if (!match) continue;
    posted.push({
      sales_row_id: match[1],
      staff_id: match[2],
      hours: fromInputValue(String(raw)),
    });
  }
  if (posted.length === 0) return { notice: "Nothing to save." };

  const negative = posted.find((c) => c.hours !== null && c.hours < 0);
  if (negative) return { error: "Hours cannot be less than nothing." };

  const supabase = await createClient();
  const filled = posted.filter((c) => c.hours !== null);
  const cleared = posted.filter((c) => c.hours === null);

  if (filled.length > 0) {
    const { error } = await supabase.from("report_client_hours").upsert(
      filled.map((c) => ({
        workspace_id: workspaceId,
        sales_row_id: c.sales_row_id,
        staff_id: c.staff_id,
        month,
        hours: c.hours,
        // Overruled by the guard, which reads the staff member's own.
        // Sent because the column is `not null` and the trigger runs
        // after the row is built.
        rate_used: 1,
      })),
      { onConflict: "workspace_id,sales_row_id,staff_id,month" },
    );
    if (error) return { error: explain(error.message, "Couldn't save the hours.") };
  }

  // An empty cell is nobody's hours, not nought hours worked — and the
  // difference reaches the per-client card, which leaves a client with
  // no hours out of the month rather than showing an infinite rate.
  for (const cell of cleared) {
    const { error } = await supabase
      .from("report_client_hours")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("sales_row_id", cell.sales_row_id)
      .eq("staff_id", cell.staff_id)
      .eq("month", month);
    if (error) return { error: explain(error.message, "Couldn't clear a cell.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}
