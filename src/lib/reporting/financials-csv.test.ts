import assert from "node:assert/strict";
import { test } from "node:test";

import { financialsCsv } from "./financials-csv.ts";
import type { ActualCell, Cell, ExpenseRow, SalesRow } from "./ledger.ts";
import type { ExpenseCategory } from "./expense-queries.ts";

/**
 * The one export in the product (§11), which is why it is shaped like
 * the screens: rows down, months across, a year total. What Nina does
 * with it is paste it beside her own spreadsheet.
 */

const rows: SalesRow[] = [
  { id: "r1", name: "Signature programme", rowType: "offer", offerEntityId: "o1", active: true, recurrence: "none" },
  // A name with a comma in it, which is a name somebody will type.
  { id: "r2", name: 'Bella Ltd, trading as "Crane"', rowType: "client", offerEntityId: null, active: true, recurrence: "monthly" },
  { id: "r3", name: "Never used", rowType: "client", offerEntityId: null, active: true, recurrence: "none" },
];
const actuals: ActualCell[] = [
  { salesRowId: "r1", month: "2026-01-01", amount: 2000, recurrence: "none" },
  { salesRowId: "r2", month: "2026-01-01", amount: 400, recurrence: "monthly" },
  { salesRowId: "r2", month: "2026-02-01", amount: 400, recurrence: "monthly" },
];
const forecasts: Cell[] = [
  { salesRowId: "r2", month: "2026-02-01", amount: 400 },
  { salesRowId: "r2", month: "2026-03-01", amount: 400 },
];
const categories: ExpenseCategory[] = [
  { id: "c1", name: "Software", bucket: "fixed", isDefault: true, active: true },
  { id: "c2", name: "Staff", bucket: "team", isDefault: true, active: true },
  { id: "c3", name: "Never used", bucket: "variable", isDefault: true, active: true },
];
const expenses: ExpenseRow[] = [
  { categoryId: "c1", bucket: "fixed", month: "2026-01-01", amount: 120 },
  { categoryId: "c2", bucket: "team", month: "2026-01-01", amount: 900 },
];

const csv = () =>
  financialsCsv({
    businessName: "Northwind Studio",
    year: "2026",
    rows,
    actuals,
    forecasts,
    categories,
    expenses,
  });

const lines = () => csv().trimEnd().split("\r\n");

/**
 * A line split into fields, respecting the quoting.
 *
 * A naive `split(",")` would cut the one row this file exists to get
 * right — the name with a comma in it — straight down the middle, and
 * the test would then be asserting the bug.
 */
function fields(row: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (quoted) {
      if (c === '"' && row[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') quoted = false;
      else current += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out;
}
const lineStarting = (prefix: string) =>
  lines().find((l) => l.startsWith(prefix)) ?? `NOT FOUND: ${prefix}`;

test("the three grids, each as it is drawn", () => {
  const all = lines();
  assert.ok(all.includes("What came in"));
  assert.ok(all.includes("What you expect"));
  assert.ok(all.includes("What it cost"));
  assert.ok(all.includes("The totals"));
  assert.equal(all[0], "Northwind Studio — Financials,2026");
});

test("a name with a comma and a quote in it survives", () => {
  // The whole reason the quoting is not optional: a row is named by the
  // client, and "Bella Ltd, trading as "Crane"" is a name somebody will
  // type. Unquoted it would silently become two columns.
  const row = lineStarting('"Bella Ltd');
  assert.ok(
    row.startsWith('"Bella Ltd, trading as ""Crane""",Client,Monthly,'),
    row,
  );
});

test("a month nobody typed into is empty, never 0", () => {
  const cells = fields(lineStarting("Signature programme"));
  assert.equal(cells[3], "2000", "January");
  assert.equal(cells[4], "", "February, which nobody typed into");
  assert.equal(cells.at(-1), "2000", "and the year is the one month it had");
});

test("a row with nothing in a grid is not in that grid", () => {
  const out = csv();
  assert.ok(!out.includes("Never used"), "neither the row nor the category");
  // And the row that is only in one grid is only in that one: Signature
  // programme took money and nobody forecast it.
  const expect = out.slice(out.indexOf("What you expect"), out.indexOf("What it cost"));
  assert.ok(!expect.includes("Signature programme"));
});

test("the totals line up with the grids above them", () => {
  // Months are named in full: this is read in a spreadsheet, not in a
  // column 88px wide.
  assert.equal(
    lineStarting("January,"),
    // in, expected, fixed, variable, team, investment, costs, profit
    "January,2400,,120,,900,,1020,1380",
    "money in less what it cost, and the empty buckets stay empty",
  );
  assert.equal(
    lineStarting("March,"),
    "March,,400,,,,,,",
    "a month with only a forecast has only that",
  );
});

test("every row has the same number of fields, which is what makes it a table", () => {
  // Fifteen: the three in front of "What came in"'s months, twelve
  // months and the year. A ragged file opens in a spreadsheet with its
  // columns one out from the row below, and nothing says why.
  const came = lines().slice(lines().indexOf("What came in") + 1);
  const header = fields(came[0]).length;
  assert.equal(header, 16, "row, kind, recurring, twelve months, year");
  for (const row of came) {
    if (row === "") break;
    assert.equal(fields(row).length, header, row);
  }
});
