import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ActualCell,
  Cell,
  Recurrence,
  SalesRow,
  SalesRowType,
} from "./ledger.ts";

/**
 * The two grids, read in one go.
 *
 * **The whole workspace, not one month.** Nina's tracker is a year grid —
 * one row per offer or customer, twelve month columns, a year total — so
 * a month's worth of rows would draw eleven empty columns. A forecast
 * also runs past the year it was typed in.
 *
 * Three small tables for one small business: a client with forty rows and
 * three years of history is in the low thousands of cells. If that ever
 * stops being true the fix is a date window with a year of overlap, not a
 * month.
 *
 * RLS does the rest: a retainer client reads a cell when its month is
 * published and not before, which is the rule every other piece of month
 * content wears.
 */

export interface SalesLedger {
  rows: SalesRow[];
  actuals: ActualCell[];
  forecasts: Cell[];
}

interface RowRecord {
  id: string;
  name: string;
  row_type: SalesRowType;
  offer_entity_id: string | null;
  active: boolean;
  recurrence: Recurrence;
}

interface CellRecord {
  sales_row_id: string;
  month: string;
  amount: number | string;
}

interface ActualRecord extends CellRecord {
  recurrence: Recurrence;
}

/** `numeric` arrives as a string from some drivers, as everywhere else here. */
const num = (v: number | string | null): number => {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A `date` column can come back with a time on it. Months are days here. */
const day = (v: string) => v.slice(0, 10);

export async function getSalesLedger(workspaceId: string): Promise<SalesLedger> {
  const supabase = await createClient();

  const [rowRes, actualRes, forecastRes] = await Promise.all([
    supabase
      .from("report_sales_rows")
      .select("id, name, row_type, offer_entity_id, active, recurrence")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name")
      .returns<RowRecord[]>(),
    // No id on either: (row, month) is unique, so that pair is the handle
    // the grid saves a cell by.
    supabase
      .from("report_actuals")
      .select("sales_row_id, month, amount, recurrence")
      .eq("workspace_id", workspaceId)
      .order("month")
      .returns<ActualRecord[]>(),
    supabase
      .from("report_forecasts")
      .select("sales_row_id, month, amount")
      .eq("workspace_id", workspaceId)
      .order("month")
      .returns<CellRecord[]>(),
  ]);

  return {
    rows: (rowRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      rowType: r.row_type,
      offerEntityId: r.offer_entity_id,
      active: r.active,
      recurrence: r.recurrence,
    })),
    actuals: (actualRes.data ?? []).map((c) => ({
      salesRowId: c.sales_row_id,
      month: day(c.month),
      amount: num(c.amount),
      recurrence: c.recurrence,
    })),
    forecasts: (forecastRes.data ?? []).map((c) => ({
      salesRowId: c.sales_row_id,
      month: day(c.month),
      amount: num(c.amount),
    })),
  };
}
