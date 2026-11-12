import { financialsCsv } from "@/lib/reporting/financials-csv";
import { getExpenseLedger } from "@/lib/reporting/expense-queries";
import { getSalesLedger } from "@/lib/reporting/sales-queries";
import { resolveReportContext } from "@/lib/reporting/context";

/**
 * The one export in the product (§11), as a file.
 *
 * **Editors only.** The rule §11 states — clients view their data as a
 * designed report, nothing exports — is about what a client is handed,
 * and the exception Nina made on 11 November is for the person doing
 * the books. A retainer client reaching this gets the same 403 the
 * entry screens give them, not a file.
 *
 * Reads through the member's own session, so RLS decides what is in it
 * exactly as it decides what is on the screens.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await resolveReportContext({
    workspace: url.searchParams.get("workspace") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });

  if (!ctx.canEdit) {
    return new Response("Your report is filled in by your Allegro team.", { status: 403 });
  }

  const [ledger, expenses] = await Promise.all([
    getSalesLedger(ctx.workspace.id),
    getExpenseLedger(ctx.workspace.id),
  ]);

  const year = ctx.month.month.slice(0, 4);
  const csv = financialsCsv({
    businessName: ctx.workspace.business_name,
    year,
    rows: ledger.rows,
    actuals: ledger.actuals,
    forecasts: ledger.forecasts,
    categories: expenses.categories,
    expenses: expenses.expenses,
  });

  // The name is what it will be called in somebody's downloads folder a
  // year from now, so it says whose and which year.
  const file = `${ctx.workspace.business_name} financials ${year}.csv`.replace(/[^\w .-]/g, "");

  // **A byte-order mark, deliberately.** Excel reads a plain UTF-8 CSV
  // as Latin-1 and turns every pound sign into Â£, which is the first
  // thing anybody would notice and the last thing they would guess at.
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
