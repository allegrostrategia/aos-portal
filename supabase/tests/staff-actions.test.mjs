/**
 * Her Client Profitability tab: the member's own team, and whose hours
 * went on which client.
 *
 * Two rules carry the whole thing, and both are the database's rather
 * than the app's: **hours go against a client row, never an offer**, and
 * **the rate is captured when the hours are saved**, so a pay rise costs
 * the months after it and not the ones already published.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { saveStaff, saveClientHours } = await import("../../src/lib/reporting/staff-actions.ts");
const { getStaffLedger } = await import("../../src/lib/reporting/staff-queries.ts");
const { saveSalesRow, saveActuals } = await import("../../src/lib/reporting/sales-actions.ts");
const { getSalesLedger } = await import("../../src/lib/reporting/sales-queries.ts");
const { clientProfitability } = await import("../../src/lib/reporting/ledger.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JAN}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
  for (const month of [JAN, FEB, MAR]) {
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
const ledger = () => as(ELIZE, () => getStaffLedger(WS));
const publish = (month) =>
  asMember(db, NINA, () =>
    db.query(
      `update public.report_periods set published_at = now(), published_by = '${NINA}'
        where workspace_id = '${WS}' and month = '${month}'`,
    ),
  );

let CLIENT_ROW;
let OFFER_ROW;
let ANNA;

test("a client to work on, and money from them", async () => {
  await as(ELIZE, () =>
    saveSalesRow(null, form({ workspace_id: WS, name: "Bella Ltd", row_type: "client" })),
  );
  await as(ELIZE, () =>
    saveSalesRow(null, form({ workspace_id: WS, name: "Signature programme", row_type: "offer" })),
  );
  const { rows } = await as(ELIZE, () => getSalesLedger(WS));
  CLIENT_ROW = rows.find((r) => r.rowType === "client").id;
  OFFER_ROW = rows.find((r) => r.rowType === "offer").id;

  await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${CLIENT_ROW}:${JAN}`]: 2000 })),
  );
});

test("somebody to do the work, with what their time costs", async () => {
  const added = await as(ELIZE, () =>
    saveStaff(null, form({ workspace_id: WS, name: "Anna", hourly_rate: 40 })),
  );
  assert.match(added?.notice ?? "", /Anna added/);

  const refused = await as(ELIZE, () =>
    saveStaff(null, form({ workspace_id: WS, name: "Free", hourly_rate: 0 })),
  );
  assert.match(refused?.error ?? "", /more than nothing/);

  const { staff } = await ledger();
  assert.deepEqual(
    staff.map((s) => [s.name, s.hourlyRate, s.active]),
    [["Anna", 40, true]],
  );
  ANNA = staff[0].id;
});

test("hours go against a client, never an offer", async () => {
  const refused = await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: JAN, [`hours:${OFFER_ROW}:${ANNA}`]: 10 }),
    ),
  );
  assert.match(refused?.error ?? "", /Hours go against a client/);
  assert.equal((await ledger()).hours.length, 0);
});

test("the hours, and the rate they were saved at", async () => {
  const saved = await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: JAN, [`hours:${CLIENT_ROW}:${ANNA}`]: 12 }),
    ),
  );
  assert.equal(saved?.notice, "Saved.");

  const { hours } = await ledger();
  assert.deepEqual(
    hours.map((h) => [h.month, h.hours, h.rateUsed]),
    [[JAN, 12, 40]],
    "the rate came off Anna, not off the form",
  );
});

test("THE POINT: a pay rise does not rewrite a month already worked", async () => {
  // February's hours too, while Anna is still on 40 — and February
  // stays a draft, so it can be corrected after the rise. **That is the
  // case the capture is really for**: a published month is held still by
  // the month lock anyway, and a test that only published proved
  // nothing about the capture at all.
  await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: FEB, [`hours:${CLIENT_ROW}:${ANNA}`]: 10 }),
    ),
  );
  await publish(JAN);

  const raised = await as(ELIZE, () =>
    saveStaff(null, form({ workspace_id: WS, staff_id: ANNA, name: "Anna", hourly_rate: 60 })),
  );
  assert.equal(raised?.error, undefined, raised?.error);
  assert.match(raised?.notice ?? "", /keep the rate they were saved with/);

  const after = await ledger();
  assert.equal(after.staff[0].hourlyRate, 60, "she is paid 60 now");
  assert.equal(
    after.hours.find((h) => h.month === JAN)?.rateUsed,
    40,
    "and January still cost 40 an hour",
  );

  // **Correcting February's hours does not re-rate them either.** The
  // rate is what it was when the work was saved, not what the person
  // costs the next time somebody touches the row.
  await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: FEB, [`hours:${CLIENT_ROW}:${ANNA}`]: 11 }),
    ),
  );
  const corrected = (await ledger()).hours.find((h) => h.month === FEB);
  assert.equal(corrected?.hours, 11, "the correction went through");
  assert.equal(corrected?.rateUsed, 40, "and it still cost 40 an hour");

  // March is a draft with nothing in it, so hours saved there are new
  // work at the rate she is on now.
  await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: MAR, [`hours:${CLIENT_ROW}:${ANNA}`]: 5 }),
    ),
  );
  assert.equal((await ledger()).hours.find((h) => h.month === MAR)?.rateUsed, 60);
});

test("a published month refuses hours, in words somebody can act on", async () => {
  const refused = await as(ELIZE, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: JAN, [`hours:${CLIENT_ROW}:${ANNA}`]: 99 }),
    ),
  );
  assert.match(refused?.error ?? "", /published, so its figures are fixed/i);
  assert.equal((await ledger()).hours.find((h) => h.month === JAN)?.hours, 12);
});

test("what the client was worth, from the two grids and nothing typed twice", async () => {
  const sales = await as(ELIZE, () => getSalesLedger(WS));
  const staff = await ledger();
  const [row] = clientProfitability(sales.rows, sales.actuals, staff.hours, JAN);

  assert.equal(row.name, "Bella Ltd");
  assert.equal(row.paid, 2000, "from the Actual grid, not typed here");
  assert.equal(row.hours, 12);
  assert.equal(row.staffCost, 480, "12 hours at the 40 they were saved at");
  assert.equal(row.profit, 1520);
  assert.equal(Number(row.margin.toFixed(1)), 76);
});

test("retiring somebody keeps every hour they ever worked", async () => {
  const retired = await as(ELIZE, () =>
    saveStaff(null, form({ workspace_id: WS, staff_id: ANNA, name: "Anna", retire: "yes" })),
  );
  assert.match(retired?.notice ?? "", /Anna retired/);

  const after = await ledger();
  assert.equal(after.staff[0].active, false);
  assert.equal(after.hours.length, 3, "every month she worked is still there");
});

test("a client cannot write hours of their own", async () => {
  const refused = await as(CLIENT, () =>
    saveClientHours(
      null,
      form({ workspace_id: WS, month: FEB, [`hours:${CLIENT_ROW}:${ANNA}`]: 1 }),
    ),
  );
  assert.match(refused?.error ?? "", /filled in by your Allegro team/);
});
