import "server-only";

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages, PAGE_SIZE } from "@/lib/reporting/paging";

/**
 * Everything the admin client list reads, paged.
 *
 * Extracted from the page so it can be tested against a real database. The
 * page itself cannot be: it needs an admin session and a Next request.
 *
 * **Every one of these sorts ends in `id`, and that is the whole point.**
 * `.range()` paging asks the database for rows 0–999, then 1000–1999, as two
 * separate queries. If the sort is not unique — and `business_name`, a
 * `month` shared by forty clients, and `workspace_id` are all shared by many
 * rows — Postgres is free to order the tied rows differently each time. A
 * row can then appear in both pages or in neither, and the result is a
 * count that is quietly wrong: exactly the failure paging was added to
 * prevent, reintroduced by the fix for it. Dom caught this on review.
 *
 * `id` is a primary key, so appending it makes every sort total.
 */

export interface ReportClientRow {
  id: string;
  kind: "retainer" | "aos_member" | "chiarezza";
  business_name: string;
  currency: string;
  first_month: string;
  access_end_date: string | null;
}

export interface ReportGrantRow {
  workspace_id: string;
  user_id: string;
  role: "client" | "team";
  display_name: string;
}

export interface ReportPeriodRow {
  workspace_id: string;
  month: string;
  published_at: string | null;
  /** So a failed publish email is visible without opening each client. */
  email_sent_at: string | null;
  email_error: string | null;
}

export interface ReportClientData {
  workspaces: ReportClientRow[];
  grants: ReportGrantRow[];
  periods: ReportPeriodRow[];
}

/**
 * `pageSize` exists so a test can straddle a page boundary without inserting
 * two thousand rows. Nothing in the app passes it.
 */
export async function getReportClientData(
  { pageSize = PAGE_SIZE }: { pageSize?: number } = {},
): Promise<ReportClientData> {
  const supabase = await createClient();

  const [workspaces, grants, periods] = await Promise.all([
    fetchAllPages<ReportClientRow>(
      (from, to) =>
        supabase
          .from("report_workspaces")
          .select("id, kind, business_name, currency, first_month, access_end_date")
          .order("business_name")
          .order("id")
          .range(from, to)
          .returns<ReportClientRow[]>(),
      { pageSize },
    ),
    fetchAllPages<ReportGrantRow>(
      (from, to) =>
        supabase
          .from("report_access")
          .select("workspace_id, user_id, role, display_name, id")
          .order("workspace_id")
          .order("id")
          .range(from, to)
          .returns<ReportGrantRow[]>(),
      { pageSize },
    ),
    fetchAllPages<ReportPeriodRow>(
      (from, to) =>
        supabase
          .from("report_periods")
          .select("workspace_id, month, published_at, email_sent_at, email_error, id")
          .order("month", { ascending: false })
          .order("id")
          .range(from, to)
          .returns<ReportPeriodRow[]>(),
      { pageSize },
    ),
  ]);

  return { workspaces, grants, periods };
}
