import { bucketTotals, receivedIn, forecastIn, type ActualCell, type Cell, type ExpenseRow, type SalesRow } from "./ledger.ts";
import type { ExpenseCategory } from "./expense-queries.ts";
import { monthLabel } from "./months.ts";

/**
 * The one export in the product (§11).
 *
 * **Nina lifted the no-export rule for this and nothing else**, 11
 * November: sales rows by month, expense rows by month, and the totals.
 * Everything else in the tool is a designed report, and the PDF of it is
 * a print of that page rather than a data download.
 *
 * **Shaped like the screens, not like the tables.** What she does with
 * this is paste it into a spreadsheet beside her own, so it is the three
 * grids as they are drawn — rows down, months across, a year total —
 * rather than a tidy long format that would need a pivot before it meant
 * anything.
 *
 * Pure, so it can be tested without a database or an HTTP response.
 */

/** Jan–Dec of a year, as the grids read. */
const monthsOf = (year: string) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);

/**
 * One field, escaped.
 *
 * A row is named by the client — "Bella Ltd, trading as Crane" is a name
 * somebody will type — so the quoting is not optional, and a figure is
 * written plain so a spreadsheet reads it as a number rather than text.
 */
function field(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const line = (cells: (string | number | null)[]) => cells.map(field).join(",");

export interface FinancialsCsvInput {
  businessName: string;
  year: string;
  rows: SalesRow[];
  actuals: ActualCell[];
  forecasts: Cell[];
  categories: ExpenseCategory[];
  expenses: ExpenseRow[];
}

export function financialsCsv(input: FinancialsCsvInput): string {
  const months = monthsOf(input.year);
  const heads = months.map((m) => monthLabel(m).split(" ")[0]);
  const out: string[] = [];

  out.push(line([`${input.businessName} — Financials`, input.year]));
  out.push("");

  // --- what came in --------------------------------------------------------
  out.push(line(["What came in"]));
  out.push(line(["Row", "Kind", "Recurring", ...heads, "Year"]));
  for (const row of input.rows) {
    const cells = months.map((m) => amountOf(input.actuals, row.id, m));
    if (cells.every((c) => c === null)) continue;
    out.push(
      line([
        row.name,
        row.rowType === "offer" ? "Offer" : "Client",
        row.recurrence === "none" ? "No" : row.recurrence === "monthly" ? "Monthly" : "Annual",
        ...cells,
        sum(cells),
      ]),
    );
  }
  out.push(
    line([
      "Total",
      "",
      "",
      ...months.map((m) => receivedIn(input.actuals, m)),
      sum(months.map((m) => receivedIn(input.actuals, m))),
    ]),
  );
  out.push("");

  // --- what you expect -----------------------------------------------------
  out.push(line(["What you expect"]));
  out.push(line(["Row", ...heads, "Year"]));
  for (const row of input.rows) {
    const cells = months.map((m) => amountOf(input.forecasts, row.id, m));
    if (cells.every((c) => c === null)) continue;
    out.push(line([row.name, ...cells, sum(cells)]));
  }
  out.push(
    line([
      "Total",
      ...months.map((m) => forecastIn(input.forecasts, m)),
      sum(months.map((m) => forecastIn(input.forecasts, m))),
    ]),
  );
  out.push("");

  // --- what it cost --------------------------------------------------------
  out.push(line(["What it cost"]));
  out.push(line(["Category", "Feeds", ...heads, "Year"]));
  for (const category of input.categories) {
    const cells = months.map((m) => costOf(input.expenses, category.id, m));
    if (cells.every((c) => c === null)) continue;
    out.push(line([category.name, bucketName(category.bucket), ...cells, sum(cells)]));
  }
  out.push("");

  // --- the totals ----------------------------------------------------------
  // **The four buckets come off the rows, not off the categories.** Each
  // figure kept the bucket it was saved with, so a category that moved
  // does not restate the months before it moved.
  out.push(line(["The totals"]));
  out.push(
    line([
      "Month",
      "Money in",
      "Money expected",
      "Fixed",
      "Variable",
      "Team",
      "Investment",
      "Total costs",
      "Profit",
    ]),
  );
  for (const [i, month] of months.entries()) {
    const inMonth = input.expenses.filter((e) => e.month === month);
    const buckets = bucketTotals(inMonth);
    const costs = sum([buckets.fixed, buckets.variable, buckets.team, buckets.investment]);
    const came = receivedIn(input.actuals, month);
    out.push(
      line([
        heads[i],
        came,
        forecastIn(input.forecasts, month),
        buckets.fixed,
        buckets.variable,
        buckets.team,
        buckets.investment,
        costs,
        came === null && costs === null ? null : (came ?? 0) - (costs ?? 0),
      ]),
    );
  }

  // A trailing newline, because a file that does not end in one makes
  // some tools swallow the last row.
  return `${out.join("\r\n")}\r\n`;
}

/** A month nobody typed into is empty, never 0 — the rule every screen keeps. */
function amountOf(
  cells: { salesRowId: string; month: string; amount: number }[],
  rowId: string,
  month: string,
): number | null {
  const found = cells.find((c) => c.salesRowId === rowId && c.month === month);
  return found ? found.amount : null;
}

function costOf(expenses: ExpenseRow[], categoryId: string, month: string): number | null {
  const found = expenses.find((e) => e.categoryId === categoryId && e.month === month);
  return found ? found.amount : null;
}

function sum(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length === 0 ? null : real.reduce((t, v) => t + v, 0);
}

function bucketName(bucket: ExpenseRow["bucket"]): string {
  return { fixed: "Fixed", variable: "Variable", team: "Team", investment: "Investment" }[
    bucket
  ];
}
