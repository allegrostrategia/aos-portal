/**
 * The Financials ledger: what the database refuses (11 November).
 *
 * The screens come next; these are the rules that have to hold whatever
 * the screens do, because a form is never the only way in.
 *
 * The one that matters is the late payment. A payment belongs to two
 * months — the month it was sold for and the month the money arrived —
 * and the published-month lock has to hold the first still while letting
 * the second be answered later.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const SEP = "2026-09-01";
const OCT = "2026-10-01";
const NOV = "2026-11-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
let OTHER;
let OFFER;
let FUNNEL;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${SEP}')).id as id`)
  ).rows[0].id;
  OTHER = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Somebody Else', 'Bella Test', '${SEP}')).id as id`)
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

  for (const month of [SEP, OCT, NOV]) {
    await db.query(
      `insert into public.report_periods (workspace_id, month) values ('${WS}', '${month}')`,
    );
  }
});

const as = (uid, fn) => asMember(db, uid, fn);
const rows = async (sql) => (await as(NINA, () => db.query(sql))).rows;
const publish = (month, yes = true) =>
  as(NINA, () =>
    db.query(
      `update public.report_periods
          set published_at = ${yes ? "now()" : "null"}, published_by = ${yes ? `'${NINA}'` : "null"}
        where workspace_id = '${WS}' and month = '${month}'`,
    ),
  );

let OFFER_ROW;
let CLIENT_ROW;

test("a sales row is an offer or a customer, and a link is optional", async () => {
  await as(ELIZE, async () => {
    OFFER_ROW = (
      await db.query(`insert into public.report_sales_rows
                        (workspace_id, name, row_type, offer_entity_id, sort_order)
                      values ('${WS}', 'Signature programme', 'offer', '${OFFER}', 1)
                      returning id`)
    ).rows[0].id;
    CLIENT_ROW = (
      await db.query(`insert into public.report_sales_rows (workspace_id, name, row_type, sort_order)
                      values ('${WS}', 'A retainer client', 'client', 2) returning id`)
    ).rows[0].id;
  });

  const all = await rows(
    `select name, row_type, offer_entity_id is not null as linked
       from public.report_sales_rows where workspace_id = '${WS}' order by sort_order`,
  );
  assert.deepEqual(all.map((r) => [r.row_type, r.linked]), [
    ["offer", true],
    ["client", false],
  ]);
});

test("a client row cannot be linked to an offer, and a link must be an offer of theirs", async () => {
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sales_rows
                    (workspace_id, name, row_type, offer_entity_id)
                  values ('${WS}', 'Mixed up', 'client', '${OFFER}')`),
      ),
    /offer_link_only_on_offer_rows/,
    "a person is not an offer",
  );

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sales_rows
                    (workspace_id, name, row_type, offer_entity_id)
                  values ('${WS}', 'A funnel somehow', 'offer', '${FUNNEL}')`),
      ),
    /only be linked to an offer/,
  );

  let theirs;
  await as(NINA, async () => {
    theirs = (
      await db.query(`insert into public.report_entities (workspace_id, entity_type, name)
                      values ('${OTHER}', 'offer', 'Their offer') returning id`)
    ).rows[0].id;
  });
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sales_rows
                    (workspace_id, name, row_type, offer_entity_id)
                  values ('${WS}', 'Borrowed', 'offer', '${theirs}')`),
      ),
    /own offer/,
  );
});

test("the grid is one cell per row per month", async () => {
  // £2,000 sold in September, paid £500 a month.
  await as(ELIZE, () =>
    db.query(`insert into public.report_sale_payments
                (workspace_id, sales_row_id, due_month, received_month, amount)
              values ('${WS}', '${OFFER_ROW}', '${SEP}', '${SEP}', 500),
                     ('${WS}', '${OFFER_ROW}', '${OCT}', '${OCT}', 500),
                     ('${WS}', '${OFFER_ROW}', '${NOV}', null, 500)`),
  );

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sale_payments
                    (workspace_id, sales_row_id, due_month, amount)
                  values ('${WS}', '${OFFER_ROW}', '${SEP}', 99)`),
      ),
    /duplicate key|unique/i,
    "one cell, not two",
  );

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sale_payments
                    (workspace_id, sales_row_id, due_month, amount)
                  values ('${WS}', '${CLIENT_ROW}', '2026-09-14', 99)`),
      ),
    /due_is_first/,
    "a month, not a day",
  );
});

test("THE POINT: a published month fixes the sale, and a late payment can still be recorded", async () => {
  // An invoice due in September that nobody has paid yet. This is the
  // case the whole two-month design is for.
  await as(ELIZE, () =>
    db.query(`insert into public.report_sale_payments
                (workspace_id, sales_row_id, due_month, received_month, amount)
              values ('${WS}', '${CLIENT_ROW}', '${SEP}', null, 800)`),
  );

  await publish(SEP);

  // September's sale is fixed: the report has gone out saying what they
  // sold that month.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set amount = 999
                   where workspace_id = '${WS}' and sales_row_id = '${CLIENT_ROW}'
                     and due_month = '${SEP}'`),
      ),
    /published/i,
  );

  // But the money turning up in November is news about November, not a
  // change to September — so it goes in.
  await as(ELIZE, () =>
    db.query(`update public.report_sale_payments set received_month = '${NOV}'
               where workspace_id = '${WS}' and sales_row_id = '${CLIENT_ROW}'
                 and due_month = '${SEP}'`),
  );

  const [late] = await rows(
    `select amount::float a, due_month::text d, received_month::text r
       from public.report_sale_payments
      where workspace_id = '${WS}' and sales_row_id = '${CLIENT_ROW}' and due_month = '${SEP}'`,
  );
  assert.equal(late.a, 800, "the sale did not move");
  assert.equal(late.d, SEP, "nor the month it was sold in");
  assert.equal(late.r, NOV, "and the cash landed where it actually landed");

  // Cash already counted in a published month is a different matter: it
  // was in the report, so it stays there.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set received_month = '${NOV}'
                   where workspace_id = '${WS}' and sales_row_id = '${OFFER_ROW}'
                     and due_month = '${SEP}'`),
      ),
    /when the money arrived/i,
  );

  await publish(SEP, false);
});

test("cash cannot be moved into or out of a published month either", async () => {
  await publish(OCT);

  // Out of October: that money was counted there and the report is sent.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set received_month = '${NOV}'
                   where workspace_id = '${WS}' and sales_row_id = '${OFFER_ROW}'
                     and due_month = '${OCT}'`),
      ),
    /when the money arrived/i,
  );

  // And into it, from an instalment nobody has paid yet. A published
  // month gains no cash after the fact either.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set received_month = '${OCT}'
                   where workspace_id = '${WS}' and sales_row_id = '${OFFER_ROW}'
                     and due_month = '${NOV}'`),
      ),
    /when the money arrived/i,
  );

  await publish(OCT, false);
});

test("expenses hang off a category of this client's, and a published month refuses them", async () => {
  let category;
  let theirs;
  await as(ELIZE, async () => {
    category = (
      await db.query(`insert into public.report_expense_categories (workspace_id, name, bucket)
                      values ('${WS}', 'Software', 'fixed') returning id`)
    ).rows[0].id;
  });
  await as(NINA, async () => {
    theirs = (
      await db.query(`insert into public.report_expense_categories (workspace_id, name, bucket)
                      values ('${OTHER}', 'Software', 'fixed') returning id`)
    ).rows[0].id;
  });

  await as(ELIZE, () =>
    db.query(`insert into public.report_expenses (workspace_id, category_id, month, amount)
              values ('${WS}', '${category}', '${SEP}', 120)`),
  );

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_expenses (workspace_id, category_id, month, amount)
                  values ('${WS}', '${theirs}', '${SEP}', 120)`),
      ),
    /own category/,
  );

  await publish(SEP);
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_expenses set amount = 130
                   where workspace_id = '${WS}' and month = '${SEP}'`),
      ),
    /published/i,
  );
  await publish(SEP, false);
});

test("hours are against a client row, with the rate as it was", async () => {
  let staff;
  await as(ELIZE, async () => {
    staff = (
      await db.query(`insert into public.report_staff (workspace_id, name, hourly_rate)
                      values ('${WS}', 'Staff member 1', 30) returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_client_hours
                      (workspace_id, sales_row_id, staff_id, month, hours, rate_used)
                    values ('${WS}', '${CLIENT_ROW}', '${staff}', '${SEP}', 10, 30)`);
  });

  // An offer's hours belong to the Offers screen.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_client_hours
                    (workspace_id, sales_row_id, staff_id, month, hours, rate_used)
                  values ('${WS}', '${OFFER_ROW}', '${staff}', '${SEP}', 2, 30)`),
      ),
    /against a client row/,
  );

  // A pay rise does not rewrite what is already saved.
  await as(ELIZE, () =>
    db.query(`update public.report_staff set hourly_rate = 45 where id = '${staff}'`),
  );
  const [kept] = await rows(
    `select rate_used::float r from public.report_client_hours where workspace_id = '${WS}'`,
  );
  assert.equal(kept.r, 30, "September still cost what September cost");
});

test("a client reads their own figures once the month is published", async () => {
  const asClient = async (sql) => (await asMember(db, CLIENT, () => db.query(sql))).rows;

  assert.equal(
    (await asClient(`select count(*)::int c from public.report_sale_payments`))[0].c,
    0,
    "a draft month is the team's",
  );

  await publish(SEP);
  const seen = await asClient(
    `select count(*)::int c from public.report_sale_payments where due_month = '${SEP}'`,
  );
  // Two cells sit in September: the offer row's instalment and the
  // retainer client's invoice.
  assert.equal(seen[0].c, 2, "and now September's is theirs to read");

  // **Their own team, their own clients.** The tracker this is modelled
  // on belongs to the business being reported on, so a published month's
  // profitability is theirs to read — and nothing here is about what
  // ALLEGRO spent on them, which is what §1 keeps out.
  assert.equal((await asClient(`select count(*)::int c from public.report_staff`))[0].c, 1);
  assert.equal(
    (await asClient(`select count(*)::int c from public.report_client_hours where month = '${SEP}'`))[0].c,
    1,
    "September's hours, now September is published",
  );
  await publish(SEP, false);
});

test("a client cannot write a sales row of their own", async () => {
  await assert.rejects(
    () =>
      asMember(db, CLIENT, () =>
        db.query(`insert into public.report_sales_rows (workspace_id, name, row_type)
                  values ('${WS}', 'Invented', 'client')`),
      ),
    /row-level security|violates/i,
  );
});
