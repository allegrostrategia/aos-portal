/**
 * The sales grid's writes, driven the way the screen drives them.
 *
 * `ledger.test.mjs` proves what the database refuses. This proves the
 * actions in between: that a sale and its whole schedule go in one save,
 * that clearing a cell removes it, that a refusal is reported rather than
 * swallowed, and that "they stopped" marks the sale AND the instalments
 * still to come while leaving the ones already paid alone.
 *
 * The case that matters is the last one. A customer who stops paying
 * after September is published has to be recordable, and every piece of
 * that — the guard, the arithmetic, this action, the field the form
 * offers — exists for it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { saveSalesRow, retireSalesRow, saveSale, cancelSale, savePaymentsReceived } =
  await import("../../src/lib/reporting/sales-actions.ts");
const { getSalesLedger } = await import("../../src/lib/reporting/sales-queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const SEP = "2026-09-01";
const OCT = "2026-10-01";
const NOV = "2026-11-01";
const DEC = "2026-12-01";

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
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${SEP}')).id as id`)
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

  for (const month of [SEP, OCT, NOV, DEC]) {
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

test("a row is named by the client, and a link to an offer is optional", async () => {
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
        form({
          workspace_id: WS,
          name: "Mixed up",
          row_type: "client",
          offer_entity_id: OFFER,
        }),
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
        }),
      ),
    ))?.notice,
    "Signature programme added.",
  );
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(null, form({ workspace_id: WS, name: "Bella's retainer", row_type: "client" })),
    ))?.notice,
    "Bella's retainer added.",
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
    rows.map((r) => [r.name, r.rowType, r.offerEntityId !== null, r.active]),
    [
      ["Signature programme", "offer", true, true],
      ["Bella's retainer", "client", false, true],
    ],
    "in the order they go down the grid",
  );
  OFFER_ROW = rows[0].id;
  CLIENT_ROW = rows[1].id;

  // Two rows with the same name would be two rows nobody can tell apart.
  assert.equal(
    (await as(ELIZE, () =>
      saveSalesRow(null, form({ workspace_id: WS, name: "Bella's retainer", row_type: "client" })),
    ))?.error,
    'There is already a row called "Bella\'s retainer".',
  );
});

test("a sale and its whole schedule go in one save", async () => {
  // £2,000 sold in September, paid in four £500s. One save, because four
  // is four chances to leave the last one behind.
  const result = await as(ELIZE, () =>
    saveSale(
      null,
      form({
        workspace_id: WS,
        sales_row_id: OFFER_ROW,
        month: SEP,
        total_value: 2000,
        billing: "one_off",
        [`due:${SEP}`]: 500,
        [`paid:${SEP}`]: SEP,
        [`due:${OCT}`]: 500,
        [`due:${NOV}`]: 500,
        [`due:${DEC}`]: 500,
      }),
    ),
  );
  assert.equal(result?.notice, "Sale recorded.");

  const { sales, payments } = await ledger();
  assert.equal(sales.length, 1);
  assert.equal(sales[0].totalValue, 2000, "the whole thing, in the month it was sold");
  assert.equal(sales[0].month, SEP);
  assert.deepEqual(
    payments.map((p) => [p.dueMonth, p.amount, p.receivedMonth]),
    [
      [SEP, 500, SEP],
      [OCT, 500, null],
      [NOV, 500, null],
      [DEC, 500, null],
    ],
  );
});

test("an empty cell is not an instalment, and clearing one takes it away", async () => {
  const { sales } = await ledger();
  const sale = sales[0];

  // December's cell cleared, November's moved to £400. The schedule on
  // the form IS the schedule — a merge would leave December behind.
  await as(ELIZE, () =>
    saveSale(
      null,
      form({
        workspace_id: WS,
        sale_id: sale.id,
        sales_row_id: OFFER_ROW,
        month: SEP,
        total_value: 2000,
        billing: "one_off",
        [`due:${SEP}`]: 500,
        [`paid:${SEP}`]: SEP,
        [`due:${OCT}`]: 500,
        [`due:${NOV}`]: 400,
        [`due:${DEC}`]: "",
      }),
    ),
  );
  const { payments } = await ledger();
  assert.deepEqual(
    payments.map((p) => [p.dueMonth, p.amount]),
    [
      [SEP, 500],
      [OCT, 500],
      [NOV, 400],
    ],
    "December gone, November corrected",
  );

  // £600 of the £2,000 is now in no month at all. The database does not
  // refuse it — half a payment plan is a normal thing to be looking at —
  // so it is the screen's job to say so, and `unscheduledOf` is what says
  // it. Here, just that the state is reachable.
  const { sales: after, payments: left } = await ledger();
  const scheduled = left.reduce((t, p) => t + p.amount, 0);
  assert.equal(after[0].totalValue - scheduled, 600);
});

test("a cell in a published month cannot be cleared, and the save says so", async () => {
  // The trap this guards against: RLS refusing a delete is a success with
  // no error and no rows, so the only honest test is whether the row went.
  // Without that check the form said "Sale updated" to a write the
  // database had thrown away — which is how the day-7 pairing flag was
  // silently never set for three weeks.
  const { sales } = await ledger();
  const sale = sales[0];
  await publish(OCT);

  const refused = await as(ELIZE, () =>
    saveSale(
      null,
      form({
        workspace_id: WS,
        sale_id: sale.id,
        sales_row_id: OFFER_ROW,
        month: SEP,
        total_value: 2000,
        billing: "one_off",
        [`due:${SEP}`]: 500,
        [`paid:${SEP}`]: SEP,
        [`due:${OCT}`]: "",
        [`due:${NOV}`]: 400,
      }),
    ),
  );
  const { payments } = await ledger();
  // Put the month back before asserting: a failed assertion would
  // otherwise leave October published for every test after this one.
  await publish(OCT, false);

  assert.match(refused?.error ?? "", /instalment in a published month couldn't be cleared/);
  assert.match(refused?.error ?? "", /mark it cancelled instead/, "and what to do instead");
  assert.equal(
    payments.filter((p) => p.dueMonth === OCT).length,
    1,
    "October's instalment is still there, which is why the save had to say so",
  );
});

test("a sale needs a value, and a row, and a month", async () => {
  assert.equal(
    (await as(ELIZE, () => saveSale(null, form({ workspace_id: WS, month: SEP }))))?.error,
    "Pick which row this sale belongs to.",
  );
  assert.equal(
    (await as(ELIZE, () =>
      saveSale(null, form({ workspace_id: WS, sales_row_id: OFFER_ROW, month: SEP })),
    ))?.error,
    "A sale needs a value.",
  );
  assert.equal(
    (await as(ELIZE, () =>
      saveSale(
        null,
        form({
          workspace_id: WS,
          sales_row_id: OFFER_ROW,
          month: SEP,
          total_value: -1,
        }),
      ),
    ))?.error,
    "A sale cannot be worth less than nothing.",
  );
});

test("the month's cash is ticked off in one form", async () => {
  const { sales } = await ledger();
  const sale = sales[0];

  // October's instalment came in, in October.
  const result = await as(ELIZE, () =>
    savePaymentsReceived(
      null,
      form({ workspace_id: WS, month: OCT, [`cell:${sale.id}:${OCT}`]: "on" }),
    ),
  );
  assert.equal(result?.notice, "Saved.");

  const { payments } = await ledger();
  assert.equal(payments.find((p) => p.dueMonth === OCT)?.receivedMonth, OCT);

  // And unticking takes it back out, while the month is still a draft.
  await as(ELIZE, () =>
    savePaymentsReceived(
      null,
      form({ workspace_id: WS, month: OCT, [`cell:${sale.id}:${OCT}`]: "off" }),
    ),
  );
  const { payments: back } = await ledger();
  assert.equal(back.find((p) => p.dueMonth === OCT)?.receivedMonth, null);
});

test("a published month's refusal is reported in words somebody can act on", async () => {
  const { sales } = await ledger();
  const sale = sales[0];
  await publish(SEP);

  const refused = await as(ELIZE, () =>
    saveSale(
      null,
      form({
        workspace_id: WS,
        sale_id: sale.id,
        sales_row_id: OFFER_ROW,
        month: SEP,
        total_value: 2500,
        billing: "one_off",
      }),
    ),
  );
  assert.match(refused?.error ?? "", /published, so what was sold is fixed/);
  assert.doesNotMatch(
    refused?.error ?? "",
    /check_violation|plpgsql|report_sales/,
    "and not in the guard's own words",
  );

  // The figure did not move, which is the half that matters.
  const { sales: after } = await ledger();
  assert.equal(after[0].totalValue, 2000);
});

test("THE POINT: a customer who stops paying after September is published", async () => {
  const { sales } = await ledger();
  const sale = sales[0];

  // Dated inside the published month: refused, and the wording says what
  // to do about it rather than what the trigger is called.
  const tooEarly = await as(ELIZE, () =>
    cancelSale(null, form({ workspace_id: WS, sale_id: sale.id, cancelled_on: "2026-09" })),
  );
  assert.match(tooEarly?.error ?? "", /has to be dated in a month that hasn't been published/);

  // November is open, so the news goes in.
  const marked = await as(ELIZE, () =>
    cancelSale(null, form({ workspace_id: WS, sale_id: sale.id, cancelled_on: "2026-11" })),
  );
  assert.equal(marked?.notice, "Marked as cancelled, and kept on the record.");

  const { sales: after, payments } = await ledger();
  assert.equal(after[0].cancelledOn, NOV);
  assert.equal(after[0].totalValue, 2000, "September still sold it");

  // The instalment already paid keeps its place: that money arrived, and
  // the month that counted it said so. The ones still to come go with the
  // sale.
  assert.deepEqual(
    payments.map((p) => [p.dueMonth, p.receivedMonth, p.cancelledOn]),
    [
      [SEP, SEP, null],
      [OCT, null, NOV],
      [NOV, null, NOV],
    ],
  );

  // And taking the mark off works while November is still a draft.
  assert.equal(
    (await as(ELIZE, () =>
      cancelSale(null, form({ workspace_id: WS, sale_id: sale.id, undo: "true" })),
    ))?.notice,
    "Cancellation removed.",
  );
  const { sales: undone } = await ledger();
  assert.equal(undone[0].cancelledOn, null);

  await publish(SEP, false);
});

test("a row is retired, never deleted", async () => {
  assert.equal(
    (await as(ELIZE, () =>
      retireSalesRow(
        null,
        form({ workspace_id: WS, row_id: CLIENT_ROW, name: "Bella's retainer", active: "false" }),
      ),
    ))?.notice,
    "Bella's retainer retired.",
  );

  const { rows } = await ledger();
  assert.equal(rows.length, 2, "still there — last year's figures are what they are");
  assert.equal(rows.find((r) => r.id === CLIENT_ROW)?.active, false);

  assert.equal(
    (await as(ELIZE, () =>
      retireSalesRow(
        null,
        form({ workspace_id: WS, row_id: CLIENT_ROW, name: "Bella's retainer", active: "true" }),
      ),
    ))?.notice,
    "Bella's retainer is back in the grid.",
  );
});

test("a client cannot write their own ledger", async () => {
  const refused = await as(CLIENT, () =>
    saveSalesRow(null, form({ workspace_id: WS, name: "Invented", row_type: "client" })),
  );
  assert.equal(refused?.error, "Your report is filled in by your Allegro team.");
});
