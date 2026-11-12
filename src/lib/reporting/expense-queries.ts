import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ExpenseBucket, ExpenseRow } from "./ledger.ts";

/**
 * The expense grid, read in one go.
 *
 * **The whole workspace, not one month** — the same reason the two money
 * grids are a year: her tracker is a year of categories down the side and
 * months across, and a month's worth of rows would draw eleven empty
 * columns.
 *
 * RLS does the rest: a retainer client reads a cell when its month is
 * published and not before.
 */

export interface ExpenseCategory {
  id: string;
  name: string;
  bucket: ExpenseBucket;
  /** Whether it came from the default list, so the screen can say so. */
  isDefault: boolean;
  /** Retired categories stay — rule 7 — and come off the grid. */
  active: boolean;
}

export interface ExpenseLedger {
  categories: ExpenseCategory[];
  expenses: ExpenseRow[];
}

interface CategoryRecord {
  id: string;
  name: string;
  bucket: ExpenseBucket;
  is_default: boolean;
  active: boolean;
}

interface ExpenseRecord {
  category_id: string;
  month: string;
  amount: number | string;
  bucket: ExpenseBucket;
}

/** `numeric` arrives as a string from some drivers, as everywhere else here. */
const num = (v: number | string | null): number => {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getExpenseLedger(workspaceId: string): Promise<ExpenseLedger> {
  const supabase = await createClient();

  const [categoryRes, expenseRes] = await Promise.all([
    supabase
      .from("report_expense_categories")
      .select("id, name, bucket, is_default, active")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name")
      .returns<CategoryRecord[]>(),
    // No id: (category, month) is unique, so that pair is the handle the
    // grid saves a cell by — as with the two money grids.
    //
    // **The bucket comes off the cell**, not off the category. It was
    // captured when the figure was saved, so moving "Software" from
    // Fixed to Team is forward-looking rather than a rewrite of every
    // published month's composition.
    supabase
      .from("report_expenses")
      .select("category_id, month, amount, bucket")
      .eq("workspace_id", workspaceId)
      .order("month")
      .returns<ExpenseRecord[]>(),
  ]);

  return {
    categories: (categoryRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      bucket: c.bucket,
      isDefault: c.is_default,
      active: c.active,
    })),
    expenses: (expenseRes.data ?? []).map((e) => ({
      categoryId: e.category_id,
      bucket: e.bucket,
      month: String(e.month).slice(0, 10),
      amount: num(e.amount),
    })),
  };
}
