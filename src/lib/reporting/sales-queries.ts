import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Billing, Sale, SalePayment, SalesRow, SalesRowType } from "./ledger.ts";

/**
 * The sales side of the Financials ledger, read in one go.
 *
 * **The whole workspace, not one month.** Nina's tracker is a year grid —
 * one row per offer or customer, twelve month columns, instalments written
 * across the row — and the screen is built to match, so a month's worth of
 * rows would draw eleven empty columns. A sale's instalments also reach
 * past the year it was sold in, and "£500 not yet scheduled" is wrong if
 * the instalment that accounts for it was filtered out by date.
 *
 * Three small tables for one small business: a client with forty retainers
 * and three years of history is in the low thousands of rows. If that ever
 * stops being true the fix is a date window with a year of overlap, not a
 * month.
 *
 * RLS does the rest. A retainer client reads a sale when its month is
 * published, and an instalment when its due month or the month the money
 * arrived is published — `report_can_read_payment`, narrowed on
 * 12 November because what a published month scheduled ahead comes from
 * the carried snapshot now.
 */

export interface SalesLedger {
  rows: SalesRow[];
  sales: Sale[];
  payments: SalePayment[];
}

interface RowRecord {
  id: string;
  name: string;
  row_type: SalesRowType;
  offer_entity_id: string | null;
  active: boolean;
  sort_order: number;
}

interface SaleRecord {
  id: string;
  sales_row_id: string;
  month: string;
  total_value: number | string;
  billing: Billing;
  cancelled_on: string | null;
}

interface PaymentRecord {
  sale_id: string;
  due_month: string;
  received_month: string | null;
  amount: number | string;
  cancelled_on: string | null;
}

/** `numeric` arrives as a string from some drivers, as everywhere else here. */
const num = (v: number | string | null): number => {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A `date` column can come back with a time on it. Months are days here. */
const day = (v: string | null): string | null => (v === null ? null : v.slice(0, 10));

export async function getSalesLedger(workspaceId: string): Promise<SalesLedger> {
  const supabase = await createClient();

  const [rowRes, saleRes, paymentRes] = await Promise.all([
    supabase
      .from("report_sales_rows")
      .select("id, name, row_type, offer_entity_id, active, sort_order")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name")
      .returns<RowRecord[]>(),
    supabase
      .from("report_sales")
      .select("id, sales_row_id, month, total_value, billing, cancelled_on")
      .eq("workspace_id", workspaceId)
      .order("month")
      .returns<SaleRecord[]>(),
    supabase
      .from("report_sale_payments")
      // No id: (sale_id, due_month) is unique, so that pair is the handle
      // the grid updates a cell by.
      .select("sale_id, due_month, received_month, amount, cancelled_on")
      .eq("workspace_id", workspaceId)
      .order("due_month")
      .returns<PaymentRecord[]>(),
  ]);

  return {
    rows: (rowRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      rowType: r.row_type,
      offerEntityId: r.offer_entity_id,
      active: r.active,
    })),
    sales: (saleRes.data ?? []).map((s) => ({
      id: s.id,
      salesRowId: s.sales_row_id,
      month: day(s.month)!,
      totalValue: num(s.total_value),
      billing: s.billing,
      cancelledOn: day(s.cancelled_on),
    })),
    payments: (paymentRes.data ?? []).map((p) => ({
      saleId: p.sale_id,
      dueMonth: day(p.due_month)!,
      receivedMonth: day(p.received_month),
      amount: num(p.amount),
      cancelledOn: day(p.cancelled_on),
    })),
  };
}
