"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { DEFAULT_EXPENSE_CATEGORIES } from "./expense-categories.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import type { SalesState } from "./sales-actions.ts";

/**
 * What it cost: the categories down the side, and the grid itself.
 *
 * The same three shapes the money grids have — a row, a grid, and a
 * refusal phrased for whoever is looking at the screen — because it is
 * the same job. What is different is only in the brief: about twenty
 * categories offered as a default list, renamed and retired by the
 * client, and **a bucket they cannot change**, because Total costs,
 * Profit and the margin are built on the four buckets.
 */

const BUCKETS = new Set(["fixed", "variable", "team", "investment"]);

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
  if (/duplicate key|unique/i.test(message)) return fallback;
  return `${fallback} ${message}`;
}

/**
 * Add a category, rename one, or retire it.
 *
 * **The bucket is set once, when the category is made.** Nothing here
 * changes it: Total costs, Profit and the margin are built on the four
 * buckets, and a client tidying their list is not making a decision
 * about the shape of their P&L. (The figures already saved would be
 * safe either way — `report_expenses.bucket` is captured per cell — but
 * the screen does not offer it, so neither does this.)
 *
 * **Retiring is not deleting** (rule 7). The category comes off the
 * grid; every figure ever saved against it stays, and goes on counting
 * in the months it was in.
 */
export async function saveExpenseCategory(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("category_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const bucket = String(formData.get("bucket") ?? "");
  const retire = String(formData.get("retire") ?? "");

  const supabase = await createClient();

  if (id && retire) {
    const active = retire === "no";
    const { error } = await supabase
      .from("report_expense_categories")
      .update({ active })
      .eq("id", id);
    if (error) return { error: explain(error.message, "Couldn't change that category.") };
    revalidatePath("/reporting", "layout");
    return { notice: active ? `${name} is back on the grid.` : `${name} retired.` };
  }

  if (!name) return { error: "A category needs a name." };

  if (id) {
    const { error } = await supabase
      .from("report_expense_categories")
      .update({ name })
      .eq("id", id);
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        return { error: `There is already a category called "${name}".` };
      }
      return { error: explain(error.message, "Couldn't rename that category.") };
    }
    revalidatePath("/reporting", "layout");
    return { notice: `${name} renamed.` };
  }

  if (!BUCKETS.has(bucket)) {
    return { error: "A category feeds one of the four cost buckets." };
  }

  const { error } = await supabase.from("report_expense_categories").insert({
    workspace_id: workspaceId,
    name,
    bucket,
    sort_order: await nextSortOrder(supabase, workspaceId),
  });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already a category called "${name}".` };
    }
    return { error: explain(error.message, "Couldn't add that category.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: `${name} added.` };
}

/**
 * Put the usual list on the grid.
 *
 * **A button somebody presses, not something that happens on its own.**
 * The list is examples from Nina's own tracker, and a screen that filled
 * itself in would be making a claim about this business that nobody
 * made. Anything already there by name is left alone, so pressing it
 * twice adds nothing and pressing it after renaming three of them does
 * not bring the old names back.
 */
export async function addDefaultCategories(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("report_expense_categories")
    .select("name")
    .eq("workspace_id", workspaceId)
    .returns<{ name: string }[]>();

  const taken = new Set((existing ?? []).map((c) => c.name.toLowerCase()));
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter((c) => !taken.has(c.name.toLowerCase()));
  if (missing.length === 0) return { notice: "They are all on the grid already." };

  const from = await nextSortOrder(supabase, workspaceId);
  const { error } = await supabase.from("report_expense_categories").insert(
    missing.map((c, i) => ({
      workspace_id: workspaceId,
      name: c.name,
      bucket: c.bucket,
      is_default: true,
      sort_order: from + i,
    })),
  );
  if (error) return { error: explain(error.message, "Couldn't add the usual list.") };

  revalidatePath("/reporting", "layout");
  return {
    notice: `${missing.length} categories added. Rename any of them, or retire the ones that aren't yours.`,
  };
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<number> {
  const { data } = await supabase
    .from("report_expense_categories")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .returns<{ sort_order: number }[]>();
  return (data?.[0]?.sort_order ?? 0) + 1;
}

/** A cell, posted as `cell:<category id>:<month>`. */
const CELL = /^cell:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/;

/**
 * The whole grid in one save, the way the money grids do it.
 *
 * An empty cell is a row to remove rather than a figure of zero: a month
 * nobody typed into prints a dash, and £0 of software is a claim.
 */
export async function saveExpenses(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const posted: { category_id: string; month: string; amount: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    const match = CELL.exec(field);
    if (!match) continue;
    posted.push({
      category_id: match[1],
      month: match[2],
      amount: fromInputValue(String(raw)),
    });
  }
  if (posted.length === 0) return { notice: "Nothing to save." };

  /**
   * **And it cannot run ahead of the month being entered** (Dom, 13
   * November), the same rule money received wears. There is no cost
   * forecast, so a figure in a month that has not happened is a guess
   * in a grid called "what it cost".
   */
  const entering = String(formData.get("month") ?? "");
  if (entering) {
    const tooLate = posted.find((c) => c.amount !== null && c.month > entering);
    if (tooLate) {
      return {
        error: "What it cost only goes up to the month you're entering.",
      };
    }
  }

  // An expense is money out, and a negative one is a refund of a cost —
  // which is a thing, but it is not what a mistyped figure looks like,
  // and the database has refused it since 11 November. Said here in
  // words rather than let through to a constraint's own message.
  const negative = posted.find((c) => c.amount !== null && c.amount < 0);
  if (negative) {
    return { error: "A cost cannot be less than nothing. Take the figure off the month it was refunded in." };
  }

  const supabase = await createClient();
  const filled = posted.filter((c) => c.amount !== null);
  const cleared = posted.filter((c) => c.amount === null);

  if (filled.length > 0) {
    const { error } = await supabase.from("report_expenses").upsert(
      filled.map((c) => ({
        workspace_id: workspaceId,
        category_id: c.category_id,
        month: c.month,
        amount: c.amount,
        // Overruled by `guard_report_expense_category`, which reads the
        // category's own. Sent because the column is `not null` and the
        // trigger runs after the row is built.
        bucket: "fixed" as const,
      })),
      { onConflict: "workspace_id,category_id,month" },
    );
    if (error) return { error: explain(error.message, "Couldn't save what it cost.") };
  }

  // Cleared cells go one at a time: the pair (category, month) is the
  // key, and a single `in` cannot express a list of pairs.
  for (const cell of cleared) {
    const { error } = await supabase
      .from("report_expenses")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("category_id", cell.category_id)
      .eq("month", cell.month);
    if (error) return { error: explain(error.message, "Couldn't clear a cell.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}
