import { financialsCsv } from "@/lib/reporting/financials-csv";
import { getExpenseLedger } from "@/lib/reporting/expense-queries";
import { getSalesLedger } from "@/lib/reporting/sales-queries";
import { resolveReportContext } from "@/lib/reporting/context";

/**
 * The one export in the product (§11), as a file.
 *
 * **Anyone who can open the workspace can have it** (Nina, through Dom,
 * 13 November: "it'd be good for them to be able to export that as a
 * CSV"). It is their own money; §11's rule was about the tool not being
 * a data source, and this is the one thing it was lifted for.
 *
 * **The month rule is the report's, and it is RLS's to keep.** Every
 * read here goes through the member's own session, so a retainer client
 * gets their published months and a draft one is simply not in the
 * rows — the same walk the screens make, with the same answer. There is
 * no second filter here on purpose: a second one could disagree.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await resolveReportContext({
    workspace: url.searchParams.get("workspace") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });

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
