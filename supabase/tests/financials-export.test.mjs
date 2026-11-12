/**
 * The one export in the product (§11), and who may have it.
 *
 * The rule §11 states — clients view their data as a designed report,
 * nothing exports — is about what a client is handed. Nina's exception
 * of 11 November is for the person doing the books, so the route
 * refuses a retainer client the way the entry screens do.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { getSalesLedger } = await import("../../src/lib/reporting/sales-queries.ts");
const { getExpenseLedger } = await import("../../src/lib/reporting/expense-queries.ts");
const { financialsCsv } = await import("../../src/lib/reporting/financials-csv.ts");
const { saveSalesRow, saveActuals } = await import("../../src/lib/reporting/sales-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const JAN = "2026-01-01";
const FEB = "2026-02-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JAN}')).id as id`)
  ).rows[0].id;
  for (const month of [JAN, FEB]) {
    await db.query(
      `insert into public.report_periods (workspace_id, month) values ('${WS}', '${month}')`,
    );
  }
});

const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};

const csvFor = async (uid) => {
  const [ledger, expenses] = await Promise.all([
    as(uid, () => getSalesLedger(WS)),
    as(uid, () => getExpenseLedger(WS)),
  ]);
  return financialsCsv({
    businessName: "Northwind Studio",
    year: "2026",
    rows: ledger.rows,
    actuals: ledger.actuals,
    forecasts: ledger.forecasts,
    categories: expenses.categories,
    expenses: expenses.expenses,
  });
};

test("a year of figures, as the grids are drawn", async () => {
  await as(NINA, () =>
    saveSalesRow(null, form({ workspace_id: WS, name: "Bella Ltd", row_type: "client" })),
  );
  const { rows } = await as(NINA, () => getSalesLedger(WS));
  await as(NINA, () =>
    saveActuals(
      null,
      form({ workspace_id: WS, [`cell:${rows[0].id}:${JAN}`]: 2000 }),
    ),
  );

  const csv = await csvFor(NINA);
  assert.match(csv, /What came in/);
  assert.match(csv, /Bella Ltd,Client,No,2000/);
  assert.match(csv, /^January,2000,/m, "and the totals say the same");
});

test("a client's own session puts nothing in it that is not theirs to read", async () => {
  // January is a draft, so RLS hands the client no rows at all — and the
  // file is the same walk the screen is, so it comes out empty rather
  // than full. The route refuses them anyway; this is the other half.
  const csv = await csvFor(CLIENT);
  assert.doesNotMatch(csv, /Bella Ltd/);
  assert.doesNotMatch(csv, /2000/);
});
