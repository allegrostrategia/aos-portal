/**
 * The two grids' writes, driven the way the screen drives them.
 *
 * Nina, 13 November: Actual is money received, Forecast is money
 * expected, and the screen is for entering numbers. So what there is to
 * prove is small and load-bearing — a grid saves in one go, an empty cell
 * is removed rather than stored as zero, a published month refuses both
 * in words somebody can act on, and the thing the whole redesign turns
 * on: a row that was one-off in January and a retainer from April is both
 * of those things, with no unpublish.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { saveSalesRow, saveActuals, saveForecasts } = await import(
  "../../src/lib/reporting/sales-actions.ts"
);
const { getSalesLedger } = await import("../../src/lib/reporting/sales-queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";
const APR = "2026-04-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
let OFFER;
let FUNNEL;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JAN}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);

  const made = await db.query(
    `insert into public.report_entities (workspace_id, entity_type, name, price)
     values ('${WS}', 'offer', 'Signature programme', 2000),
            ('${WS}', 'funnel', 'Webinar funnel', null)
     returning id, entity_type`,
  );
  OFFER = made.rows.find((r) => r.entity_type === "offer").id;
  FUNNEL = made.rows.find((r) => r.entity_type === "funnel").id;

  for (const month of [JAN, FEB, MAR, APR]) {
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
const ledger = () => as(ELIZE, () => getSalesLedger(WS));
const publish = (month, yes = true) =>
  asMember(db, NINA, () =>
    db.query(
      `update public.report_periods
          set published_at = ${yes ? "now()" : "null"}, published_by = ${yes ? `'${NINA}'` : "null"}
        where workspace_id = '${WS}' and month = '${month}'`,
    ),
  );

let OFFER_ROW;
let CLIENT_ROW;

test("a row is named by the client, with the offer link and the recurring tick optional", async () => {
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(null, form({ workspace_id: WS, name: "", row_type: "offer" })),
    ))?.error,
    "A row needs a name — the offer, or the client.",
  );

  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(
        null,
        form({ workspace_id: WS, name: "Mixed up", row_type: "client", offer_entity_id: OFFER }),
      ),
    ))?.error,
    "Only an offer row can be linked to an offer.",
    "caught before the database has to say it",
  );

  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(
        null,
        form({
          workspace_id: WS,
          name: "Signature programme",
          row_type: "offer",
          offer_entity_id: OFFER,
          recurrence: "none",
        }),
      ),
    ))?.notice,
    "Signature programme added.",
  );
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(
        null,
        // One-off to begin with. She goes onto a retainer in April, which
        // is the case the whole redesign turns on.
        form({ workspace_id: WS, name: "Bella Ltd", row_type: "client", recurrence: "none" }),
      ),
    ))?.notice,
    "Bella Ltd added.",
  );

  // A funnel is not an offer, and that refusal comes from the guard —
  // reported, not swallowed.
  const refused = await as(ELIZE, () =>
    saveSalesRow(
      null,
      form({
        workspace_id: WS,
        name: "A funnel somehow",
        row_type: "offer",
        offer_entity_id: FUNNEL,
      }),
    ),
  );
  assert.match(refused?.error ?? "", /only be linked to an offer/);

  const { rows } = await ledger();
  assert.deepEqual(
    rows.map((r) => [r.name, r.rowType, r.offerEntityId !== null, r.recurrence]),
    [
      ["Signature programme", "offer", true, "none"],
      ["Bella Ltd", "client", false, "none"],
    ],
    "in the order they go down the grid",
  );
  OFFER_ROW = rows[0].id;
  CLIENT_ROW = rows[1].id;
});

test("a grid saves in one go, and an empty cell is not a figure of zero", async () => {
  const result = await as(ELIZE, () =>
    saveActuals(
      null,
      form({
        workspace_id: WS,
        [`cell:${OFFER_ROW}:${JAN}`]: 1200,
        [`cell:${OFFER_ROW}:${FEB}`]: "",
        [`cell:${CLIENT_ROW}:${JAN}`]: 400,
        [`cell:${CLIENT_ROW}:${FEB}`]: 400,
      }),
    ),
  );
  assert.equal(result?.notice, "Saved.");

  const { actuals } = await ledger();
  assert.deepEqual(
    actuals.map((c) => [c.salesRowId === OFFER_ROW ? "offer" : "client", c.month, c.amount]),
    [
      ["offer", JAN, 1200],
      ["client", JAN, 400],
      ["client", FEB, 400],
    ],
    "February's empty offer cell is not a row at all — a dash, not £0",
  );
});

test("clearing a cell takes it away", async () => {
  await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${CLIENT_ROW}:${FEB}`]: "" })),
  );
  const { actuals } = await ledger();
  assert.equal(
    actuals.filter((c) => c.salesRowId === CLIENT_ROW && c.month === FEB).length,
    0,
  );
  assert.equal(actuals.length, 2, "and nothing else moved");
});

test("a refund is a month where less than nothing landed", async () => {
  // Confirmed with Dom, 13 November. No non-negative constraint on an
  // actual: the figure is what landed, and a chargeback is a real thing
  // that happens to a month.
  await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${OFFER_ROW}:${MAR}`]: -250 })),
  );
  const { actuals } = await ledger();
  assert.equal(actuals.find((c) => c.month === MAR)?.amount, -250);

  // A forecast is different: nobody forecasts negative money, so there
  // the constraint catches a typo without ever refusing a true figure.
  const refused = await as(ELIZE, () =>
    saveForecasts(null, form({ workspace_id: WS, [`cell:${OFFER_ROW}:${MAR}`]: -250 })),
  );
  assert.match(refused?.error ?? "", /amount_not_negative|Couldn't save the forecast/);
});

test("the forecast is its own grid, and nothing in it is generated", async () => {
  await as(ELIZE, () =>
    saveForecasts(
      null,
      form({
        workspace_id: WS,
        [`cell:${CLIENT_ROW}:${FEB}`]: 400,
        [`cell:${CLIENT_ROW}:${MAR}`]: 400,
        [`cell:${CLIENT_ROW}:${APR}`]: 400,
      }),
    ),
  );

  const { forecasts, actuals } = await ledger();
  assert.deepEqual(
    forecasts.filter((c) => c.salesRowId === CLIENT_ROW).map((c) => [c.month, c.amount]),
    [[FEB, 400], [MAR, 400], [APR, 400]],
    "a retainer runs across three months because somebody typed three months",
  );
  assert.equal(
    actuals.filter((c) => c.salesRowId === CLIENT_ROW && c.month === MAR).length,
    0,
    "and forecasting March did not put money in March",
  );
});

test("THE POINT: one-off in January, retainer from April, same row, no unpublish", async () => {
  // January was saved while the row said 'none'. Publishing it is what
  // makes the next part mean something.
  await publish(JAN);

  const beforeTick = await ledger();
  assert.equal(
    beforeTick.actuals.find((c) => c.salesRowId === CLIENT_ROW && c.month === JAN)?.recurrence,
    "none",
  );

  // They go onto a retainer. The row's tick changes, which is a change to
  // the DEFAULT for new months and not to anything already saved.
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(
        null,
        form({
          workspace_id: WS,
          row_id: CLIENT_ROW,
          name: "Bella Ltd",
          row_type: "client",
          recurrence: "monthly",
        }),
      ),
    ))?.notice,
    "Bella Ltd updated.",
    "no unpublish message, on a published January",
  );

  await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${CLIENT_ROW}:${APR}`]: 400 })),
  );

  const { actuals } = await ledger();
  const janCell = actuals.find((c) => c.salesRowId === CLIENT_ROW && c.month === JAN);
  const aprCell = actuals.find((c) => c.salesRowId === CLIENT_ROW && c.month === APR);
  assert.equal(janCell.recurrence, "none", "January is what January was");
  assert.equal(aprCell.recurrence, "monthly", "and April is a retainer");
  assert.equal(janCell.amount, 400, "neither figure moved");
});

test("a published month refuses a figure, in words somebody can act on", async () => {
  // January is still published from the test above.
  const refused = await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${OFFER_ROW}:${JAN}`]: 9999 })),
  );
  assert.match(refused?.error ?? "", /published, so its figures are fixed/);
  assert.doesNotMatch(
    refused?.error ?? "",
    /check_violation|plpgsql|report_actuals/,
    "and not in the guard's own words",
  );

  const { actuals } = await ledger();
  assert.equal(
    actuals.find((c) => c.salesRowId === OFFER_ROW && c.month === JAN)?.amount,
    1200,
    "the figure did not move, which is the half that matters",
  );

  // Clearing one is the same refusal, and reported the same way — a
  // delete refused by the guard raises rather than silently doing nothing.
  const cleared = await as(ELIZE, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${OFFER_ROW}:${JAN}`]: "" })),
  );
  assert.match(cleared?.error ?? "", /published/i);
  assert.equal((await ledger()).actuals.filter((c) => c.month === JAN).length, 2);

  await publish(JAN, false);
});

test("a row's kind is held still once a published month holds figures for it", async () => {
  await publish(JAN);

  const refused = await as(ELIZE, () =>
    saveSalesRow(
      null,
      form({ workspace_id: WS, row_id: CLIENT_ROW, name: "Bella Ltd", row_type: "offer" }),
    ),
  );
  assert.match(refused?.error ?? "", /figures in a published month/);

  // Renaming is not that kind of change, and stays allowed.
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(
        null,
        form({
          workspace_id: WS,
          row_id: CLIENT_ROW,
          name: "Bella Ltd (renamed)",
          row_type: "client",
          recurrence: "monthly",
        }),
      ),
    ))?.notice,
    "Bella Ltd (renamed) updated.",
  );

  await publish(JAN, false);
});

test("a client reads the grids only once the month is published", async () => {
  const asClient = async (sql) => (await asMember(db, CLIENT, () => db.query(sql))).rows;

  assert.equal(
    (await asClient(`select count(*)::int c from public.report_actuals`))[0].c,
    0,
    "a draft month is the team's",
  );

  await publish(JAN);
  assert.equal(
    (await asClient(`select count(*)::int c from public.report_actuals where month = '${JAN}'`))[0].c,
    2,
    "January's two figures, now January is published",
  );
  assert.equal(
    (await asClient(`select count(*)::int c from public.report_actuals where month > '${JAN}'`))[0].c,
    0,
    "and nothing after it",
  );
  assert.equal(
    (await asClient(`select count(*)::int c from public.report_forecasts`))[0].c,
    0,
    "nor a forecast for months they have not been shown — that comes from the freeze",
  );
  await publish(JAN, false);
});

test("a client cannot write a figure of their own", async () => {
  const refused = await as(CLIENT, () =>
    saveActuals(null, form({ workspace_id: WS, [`cell:${OFFER_ROW}:${FEB}`]: 1 })),
  );
  assert.equal(refused?.error, "Your report is filled in by your Allegro team.");
});
