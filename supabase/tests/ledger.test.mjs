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
const DEC = "2026-12-01";
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

  for (const month of [SEP, OCT, NOV, DEC]) {
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
let COURSE;   // £2,000 sold in September, paid in four instalments
let INVOICE;  // the retainer's September invoice, unpaid

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

test("a sale is counted whole, in the month it was sold", async () => {
  // Dom, 11 November: £2,000 sold in September as four £500s is £2,000
  // of September sales, not £500 of it four times.
  await as(ELIZE, async () => {
    COURSE = (
      await db.query(`insert into public.report_sales
                        (workspace_id, sales_row_id, month, total_value, billing)
                      values ('${WS}', '${OFFER_ROW}', '${SEP}', 2000, 'one_off')
                      returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_sale_payments
                      (workspace_id, sale_id, due_month, received_month, amount)
                    values ('${WS}', '${COURSE}', '${SEP}', '${SEP}', 500),
                           ('${WS}', '${COURSE}', '${OCT}', '${OCT}', 500),
                           ('${WS}', '${COURSE}', '${NOV}', null, 500),
                           ('${WS}', '${COURSE}', '${DEC}', null, 500)`);
  });

  const [sold] = await rows(
    `select sum(total_value)::float v from public.report_sales
      where workspace_id = '${WS}' and month = '${SEP}' and cancelled_on is null`,
  );
  assert.equal(sold.v, 2000, "September sold the whole thing");

  const [octSold] = await rows(
    `select coalesce(sum(total_value), 0)::float v from public.report_sales
      where workspace_id = '${WS}' and month = '${OCT}' and cancelled_on is null`,
  );
  assert.equal(octSold.v, 0, "and October sold nothing new, whatever arrives in it");
});

test("one instalment per month per sale, and a month rather than a day", async () => {
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sale_payments
                    (workspace_id, sale_id, due_month, amount)
                  values ('${WS}', '${COURSE}', '${SEP}', 99)`),
      ),
    /duplicate key|unique/i,
  );

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`insert into public.report_sale_payments
                    (workspace_id, sale_id, due_month, amount)
                  values ('${WS}', '${COURSE}', '2026-09-14', 99)`),
      ),
    /due_is_first/,
  );
});

test("MRR comes off the sale's billing, so a retainer is in it and a payment plan is not", async () => {
  // The fix: MRR used to mean revenue on offers marked recurring, which
  // dropped every retainer client on the floor.
  await as(ELIZE, async () => {
    const retainer = (
      await db.query(`insert into public.report_sales
                        (workspace_id, sales_row_id, month, total_value, billing)
                      values ('${WS}', '${CLIENT_ROW}', '${SEP}', 300, 'monthly')
                      returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_sale_payments
                      (workspace_id, sale_id, due_month, received_month, amount)
                    values ('${WS}', '${retainer}', '${SEP}', '${SEP}', 300)`);
  });

  const [recurring] = await rows(
    `select coalesce(sum(p.amount), 0)::float v
       from public.report_sale_payments p
       join public.report_sales s on s.id = p.sale_id
      where p.workspace_id = '${WS}' and p.due_month = '${SEP}'
        and s.billing <> 'one_off' and s.cancelled_on is null and p.cancelled_on is null`,
  );
  assert.equal(recurring.v, 300, "the retainer, and not the course's instalment");
});

test("THE POINT: a published month fixes the sale, and a late payment can still be recorded", async () => {
  // An invoice sold and due in September that nobody has paid yet. This
  // is the case the whole two-month design is for.
  await as(ELIZE, async () => {
    INVOICE = (
      await db.query(`insert into public.report_sales
                        (workspace_id, sales_row_id, month, total_value, billing)
                      values ('${WS}', '${CLIENT_ROW}', '${SEP}', 800, 'one_off')
                      returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_sale_payments
                      (workspace_id, sale_id, due_month, received_month, amount)
                    values ('${WS}', '${INVOICE}', '${SEP}', null, 800)`);
  });

  await publish(SEP);

  // September's sale is fixed: the report has gone out saying what they
  // sold that month.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set amount = 999
                   where workspace_id = '${WS}' and sale_id = '${INVOICE}' and due_month = '${SEP}'`),
      ),
    /published/i,
  );

  // But the money turning up in November is news about November, not a
  // change to September — so it goes in.
  await as(ELIZE, () =>
    db.query(`update public.report_sale_payments set received_month = '${NOV}'
               where workspace_id = '${WS}' and sale_id = '${INVOICE}'
                 and due_month = '${SEP}'`),
  );

  const [late] = await rows(
    `select amount::float a, due_month::text d, received_month::text r
       from public.report_sale_payments
      where workspace_id = '${WS}' and sale_id = '${INVOICE}' and due_month = '${SEP}'`,
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
                   where workspace_id = '${WS}' and sale_id = '${COURSE}' and due_month = '${SEP}'`),
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
                   where workspace_id = '${WS}' and sale_id = '${COURSE}' and due_month = '${OCT}'`),
      ),
    /when the money arrived/i,
  );

  // And into it, from an instalment nobody has paid yet. A published
  // month gains no cash after the fact either.
  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sale_payments set received_month = '${OCT}'
                   where workspace_id = '${WS}' and sale_id = '${COURSE}' and due_month = '${NOV}'`),
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

test("recategorising is forward-looking: the bucket is captured per expense", async () => {
  // Dom, 11 November. Total costs, Profit and the margin are built on
  // the four buckets, so moving "Software" from Fixed to Team would
  // otherwise rewrite the composition of every published month at once.
  let category;
  await as(ELIZE, async () => {
    category = (
      await db.query(`insert into public.report_expense_categories (workspace_id, name, bucket)
                      values ('${WS}', 'Zoom', 'fixed') returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_expenses (workspace_id, category_id, month, amount)
                    values ('${WS}', '${category}', '${SEP}', 15)`);
    // An app sending its own bucket is overruled, not believed.
    await db.query(`insert into public.report_expenses
                      (workspace_id, category_id, month, amount, bucket)
                    values ('${WS}', '${category}', '${OCT}', 15, 'team')`);
  });

  const before = await rows(
    `select month::text m, bucket from public.report_expenses
      where workspace_id = '${WS}' and category_id = '${category}' order by month`,
  );
  assert.deepEqual(before.map((r) => r.bucket), ["fixed", "fixed"], "the category's, both times");

  await as(ELIZE, () =>
    db.query(`update public.report_expense_categories set bucket = 'team' where id = '${category}'`),
  );

  const after = await rows(
    `select bucket from public.report_expenses
      where workspace_id = '${WS}' and category_id = '${category}'`,
  );
  assert.deepEqual(
    after.map((r) => r.bucket),
    ["fixed", "fixed"],
    "the months already saved keep the bucket they were saved with",
  );

  await as(ELIZE, () =>
    db.query(`insert into public.report_expenses (workspace_id, category_id, month, amount)
              values ('${WS}', '${category}', '${NOV}', 15)`),
  );
  const [fresh] = await rows(
    `select bucket from public.report_expenses
      where workspace_id = '${WS}' and category_id = '${category}' and month = '${NOV}'`,
  );
  assert.equal(fresh.bucket, "team", "and a new month takes the new one");
});

test("a sales row's kind is held still once a published month holds money for it", async () => {
  // Turning a client row into an offer row moves money between the
  // bespoke slice and an offer's slice in every month at once, and
  // there is no per-month capture that makes that mean anything.
  await publish(SEP);

  await assert.rejects(
    () =>
      as(ELIZE, () =>
        db.query(`update public.report_sales_rows set row_type = 'offer'
                   where id = '${CLIENT_ROW}'`),
      ),
    /published month/i,
  );

  // Renaming it is not that kind of change, and stays allowed.
  await as(ELIZE, () =>
    db.query(`update public.report_sales_rows set name = 'A retainer client (renamed)'
               where id = '${CLIENT_ROW}'`),
  );

  await publish(SEP, false);
  await as(ELIZE, () =>
    db.query(`update public.report_sales_rows set name = 'A retainer client'
               where id = '${CLIENT_ROW}'`),
  );
});

test("hours are against a client row, with the rate as it was", async () => {
  let staff;
  await as(ELIZE, async () => {
    staff = (
      await db.query(`insert into public.report_staff (workspace_id, name, hourly_rate)
                      values ('${WS}', 'Staff member 1', 30) returning id`)
    ).rows[0].id;
    // The rate is sent as something else entirely, and the trigger
    // overrules it: the app cannot save a figure of its own (Dom, 11
    // November).
    await db.query(`insert into public.report_client_hours
                      (workspace_id, sales_row_id, staff_id, month, hours, rate_used)
                    values ('${WS}', '${CLIENT_ROW}', '${staff}', '${SEP}', 10, 999)`);
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

  const [filled] = await rows(
    `select rate_used::float r from public.report_client_hours where workspace_id = '${WS}'`,
  );
  assert.equal(filled.r, 30, "the staff member's rate, not the 999 that was posted");

  // A pay rise does not rewrite what is already saved, and neither does
  // an edit to the hours after one.
  await as(ELIZE, () =>
    db.query(`update public.report_staff set hourly_rate = 45 where id = '${staff}'`),
  );
  await as(ELIZE, () =>
    db.query(`update public.report_client_hours set hours = 12, rate_used = 45
               where workspace_id = '${WS}'`),
  );
  const [kept] = await rows(
    `select hours::float h, rate_used::float r from public.report_client_hours
      where workspace_id = '${WS}'`,
  );
  assert.equal(kept.h, 12, "the hours were corrected");
  assert.equal(kept.r, 30, "and September still cost what September cost");
});

test("a client reads their own figures once the month is published", async () => {
  const asClient = async (sql) => (await asMember(db, CLIENT, () => db.query(sql))).rows;

  // Something sold in a month that will stay a draft, paid early into
  // the month that gets published. Made now, because the guard refuses
  // to move cash into a month that is already published.
  await as(ELIZE, async () => {
    const early = (
      await db.query(`insert into public.report_sales
                        (workspace_id, sales_row_id, month, total_value, billing)
                      values ('${WS}', '${CLIENT_ROW}', '${NOV}', 250, 'one_off')
                      returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_sale_payments
                      (workspace_id, sale_id, due_month, received_month, amount)
                    values ('${WS}', '${early}', '${NOV}', '${SEP}', 250)`);
  });

  assert.equal(
    (await asClient(`select count(*)::int c from public.report_sale_payments`))[0].c,
    0,
    "a draft month is the team's",
  );

  await publish(SEP);

  // Three cells sit in September: the course's first instalment, the
  // retainer's, and the invoice nobody has paid.
  assert.equal(
    (await asClient(
      `select count(*)::int c from public.report_sale_payments where due_month = '${SEP}'`,
    ))[0].c,
    3,
    "September's own",
  );

  // **The first half of the fix** (Dom, 11 November). The course was
  // sold in September, so the instalments it schedules into October,
  // November and December are part of what September's report says —
  // and reading by due month alone left "scheduled ahead" empty for the
  // only person it was written for.
  const ahead = await asClient(
    `select due_month::text m, amount::float a from public.report_sale_payments
      where sale_id = '${COURSE}' and due_month > '${SEP}' order by due_month`,
  );
  assert.deepEqual(
    ahead.map((r) => [r.m, r.a]),
    [[OCT, 500], [NOV, 500], [DEC, 500]],
    "the rest of a September sale, scheduled ahead",
  );

  // **The second half.** An instalment paid early into a published
  // month belongs in that month's cash, even though the month it is due
  // in is still a draft — which the old policy dropped on the floor.
  const early = await asClient(
    `select count(*)::int c from public.report_sale_payments
      where received_month = '${SEP}' and due_month = '${NOV}'`,
  );
  assert.equal(early[0].c, 1);

  // Their own team against their own clients, on their own report.
  assert.equal((await asClient(`select count(*)::int c from public.report_staff`))[0].c, 1);
  assert.equal(
    (await asClient(
      `select count(*)::int c from public.report_client_hours where month = '${SEP}'`,
    ))[0].c,
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
