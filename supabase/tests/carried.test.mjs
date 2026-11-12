/**
 * A published month keeps the figures it was published with.
 *
 * `docs/freeze-plan.md`, decisions 1–3, approved 7 October 2026. The
 * measurement that started it: taking July back to draft emptied a
 * client's published August — start, retention and churn gone, and at end
 * reading 3 where it had read 25.
 *
 * The test that matters is the last one. Everything above it exists so
 * that when that one fails, the reason is findable.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { publishMonth, unpublishMonth } = await import("../../src/lib/reporting/note-actions.ts");
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { computeCarried, draftMonthsBefore } = await import(
  "../../src/lib/reporting/carried-build.ts"
);
const { readCarried } = await import("../../src/lib/reporting/carried.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const JUL = "2026-07-01";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

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
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JUL}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => { configure(db, uid); return fn(); };
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

const save = (uid, month, category, values) =>
  as(uid, () =>
    saveCategoryValues(null, form({ workspace_id: WS, month, category, ...values })),
  );

const publish = async (month) => {
  const r = await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month })));
  await flushAfter();
  return r;
};

const carriedOn = async (month) => {
  const [row] = await rows(
    `select carried from public.report_periods where workspace_id = '${WS}' and month = '${month}'`,
  );
  return readCarried(row?.carried);
};

// ---------------------------------------------------------------------------

test("July is filled in and published, and freezes what it was published with", async () => {
  assert.equal(
    (await save(ELIZE, JUL, "client_experience", {
      "v:client_experience_clients_at_start_opening": 20,
      "v:client_experience_clients_who_left": 1,
    }))?.error,
    undefined,
  );
  assert.equal(
    (await save(ELIZE, JUL, "leads_conversions", { "v:leads_conversions_new_clients": 3 }))?.error,
    undefined,
  );

  assert.equal((await publish(JUL))?.error, undefined);

  const carried = await carriedOn(JUL);
  assert.ok(carried, "a snapshot was written");
  assert.equal(carried.clientsAtStart, 20, "July's own start is the opening figure");
});

test("August is published and freezes July's figures into itself", async () => {
  await save(ELIZE, AUG, "client_experience", { "v:client_experience_clients_who_left": 2 });
  await save(ELIZE, AUG, "leads_conversions", { "v:leads_conversions_new_clients": 5 });
  assert.equal((await publish(AUG))?.error, undefined);

  const carried = await carriedOn(AUG);
  // 20 opening + 3 joined − 1 left = 22 at the start of August.
  assert.equal(carried.clientsAtStart, 22);
  assert.equal(carried.previousClientsAtStart, 20, "July's, for the arrows");
  assert.equal(carried.previous["leads_conversions_new_clients|"], 3, "July's figure, frozen");
});

test("the snapshot carries targets, benchmarks and the entity settings", async () => {
  // Decision 2. A standing target and a benchmark belong to no month, so
  // the published-month lock cannot reach either — this is what does.
  let campaign;
  await asMember(db, NINA, async () => {
    await db.query(`insert into public.report_targets (workspace_id, metric_key, target_value)
                    values ('${WS}', 'leads_conversions_new_clients', 10)`);
    await db.query(`insert into public.report_benchmarks (workspace_id, metric_key, benchmark_value)
                    values ('${WS}', 'leads_conversions_new_clients', 7)`);
    campaign = (
      await db.query(`insert into public.report_entities
                        (workspace_id, entity_type, name, active, campaign_goal)
                      values ('${WS}', 'ad_campaign', 'Spring leads', true, 'leads') returning id`)
    ).rows[0].id;
  });

  const carried = await computeCarried(WS, SEP);
  assert.equal(carried.targets["leads_conversions_new_clients|"], 10);
  assert.equal(carried.benchmarks["leads_conversions_new_clients"], 7);
  assert.deepEqual(carried.entities[campaign], {
    name: "Spring leads",
    goal: "leads",
    // A campaign has no price, and null is the frozen answer rather than
    // the absent one: see the test below.
    price: null,
  });
});

test("a month's own target wins over the standing one, as the screen reads it", async () => {
  // The snapshot must freeze the target the screen DREW, not a different
  // one — so it applies the same precedence `getTargets` does.
  await asMember(db, NINA, () =>
    db.query(`insert into public.report_targets (workspace_id, metric_key, month, target_value)
              values ('${WS}', 'leads_conversions_new_clients', '${SEP}', 4)`),
  );
  const carried = await computeCarried(WS, SEP);
  assert.equal(carried.targets["leads_conversions_new_clients|"], 4);
});

test("an editor cannot write the snapshot themselves", async () => {
  // Dom, 7 October: `carried` goes in the publish guard's protected list,
  // insert and update, the way the email columns did. Without it the guard
  // is silent about the column and report_periods_update_editors admits the
  // row — the column-ownership trap, on the column added to close a gap.
  // A row for her to aim at: an update matching nothing is not an error,
  // which is the silent no-op that has already fooled this codebase twice.
  await asMember(db, NINA, () =>
    db.query(`insert into public.report_periods (workspace_id, month)
              values ('${WS}', '${SEP}') on conflict do nothing`),
  );

  await asMember(db, ELIZE, async () => {
    const hit = await db.query(
      `update public.report_periods set carried = carried
        where workspace_id = '${WS}' and month = '${SEP}'`,
    );
    assert.equal(hit.affectedRows, 1, "the row is hers to update, which is the point");

    await assert.rejects(
      () => db.query(`update public.report_periods set carried = '{"clientsAtStart": 999}'::jsonb
                       where workspace_id = '${WS}' and month = '${SEP}'`),
      /Only an admin can publish a report/,
    );
    await assert.rejects(
      () => db.query(`insert into public.report_periods (workspace_id, month, carried)
                      values ('${WS}', '2026-10-01', '{"clientsAtStart": 999}'::jsonb)`),
      /Only an admin can publish a report/,
    );
  });

  // And an ordinary period row is still hers to create — the guard holds
  // back a column, not the table.
  await asMember(db, ELIZE, () =>
    db.query(`insert into public.report_periods (workspace_id, month)
              values ('${WS}', '2026-10-01')`),
  );
});

test("publishing out of order is warned about, and the warning names the drafts", async () => {
  // September is not published; October has figures and is a draft.
  await save(ELIZE, SEP, "leads_conversions", { "v:leads_conversions_new_clients": 9 });
  const drafts = await draftMonthsBefore(WS, "2026-10-01");
  assert.deepEqual(drafts, [SEP], "September holds figures and has not gone out");

  // A month with nothing in it is absent, not unfinished.
  const { publishWarning } = await import("../../src/lib/reporting/publish-warning.ts");
  assert.match(
    publishWarning(drafts, "2026-10-01") ?? "",
    /September 2026 is still a draft\. Publish it first, or October 2026 will be compared against unfinished figures\./,
  );

  // And nothing is warned about when the months before are all out.
  assert.deepEqual(await draftMonthsBefore(WS, AUG), [], "July is published");
});

test("publishing out of order is refused once, then allowed", async () => {
  // The confirm is the server's, not the screen's. It was a `useState`
  // first, and the first click published the month — a confirm step that
  // does not exist before hydration is not a confirm step.
  await asMember(db, NINA, () =>
    db.query(`update public.report_periods set published_at = null, published_by = null
               where workspace_id = '${WS}' and month = '${AUG}'`),
  );

  const refused = await as(NINA, () =>
    publishMonth(null, form({ workspace_id: WS, month: SEP })),
  );
  assert.match(refused?.error ?? "", /August 2026 is still a draft/);
  assert.equal(refused?.needsConfirm, true);

  const [still] = await rows(
    `select published_at from public.report_periods where workspace_id = '${WS}' and month = '${SEP}'`,
  );
  assert.equal(still?.published_at ?? null, null, "and it really did not publish");

  const went = await as(NINA, () =>
    publishMonth(null, form({ workspace_id: WS, month: SEP, confirm: "1" })),
  );
  await flushAfter();
  assert.equal(went?.error, undefined, went?.error);

  // Put August back for the test below, which depends on it.
  await publish(AUG);
});

test("THE POINT: a published month does not change when an earlier one does", async () => {
  // The measurement from 7 October, run the other way round. August is
  // published and frozen; July goes back to draft; August must not move.
  const before = await carriedOn(AUG);

  const back = await as(NINA, () => unpublishMonth(null, form({ workspace_id: WS, month: JUL })));
  assert.equal(back?.error, undefined, back?.error);

  // Now change July out from under it — allowed, since July is a draft.
  assert.equal(
    (await save(ELIZE, JUL, "client_experience", {
      "v:client_experience_clients_at_start_opening": 500,
    }))?.error,
    undefined,
  );

  const after = await carriedOn(AUG);
  assert.deepEqual(after, before, "August carries exactly what it was published with");
  assert.equal(after.clientsAtStart, 22, "not 502, and not a dash");
});

test("and republishing August picks the correction up, which is the way through", async () => {
  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: JUL })));
  await flushAfter();

  assert.equal((await publish(AUG))?.error, undefined);
  const carried = await carriedOn(AUG);
  // 500 opening + 3 joined − 1 left.
  assert.equal(carried.clientsAtStart, 502);
});

test("a published month with an empty snapshot falls back, rather than going blank", async () => {
  // Dom, 7 October. A month the backfill missed, or one published before
  // the column existed, holds `{}` — the default. If that were read as "a
  // snapshot saying nothing", every carried figure on it would be a dash
  // and a client's report would go blank for want of a row nobody wrote.
  //
  // So `{}` means "work it out live", which is exactly what that month did
  // before any of this existed. The test drives the real `getMonthFigures`
  // rather than `readCarried` alone, because the fallback has to survive
  // the whole path, not just the parser.
  await asMember(db, NINA, () =>
    db.query(`update public.report_periods set carried = '{}'::jsonb
               where workspace_id = '${WS}' and month = '${AUG}'`),
  );
  assert.equal(await carriedOn(AUG), null, "read as no snapshot at all");

  const ctx = {
    workspace: { id: WS, kind: "retainer", currency: "GBP", hidden_categories: [] },
    month: { month: AUG, previous: JUL, label: "August 2026" },
  };
  configure(db, NINA);
  const figures = await getMonthFigures(ctx);

  assert.equal(figures.carried, null, "and getMonthFigures agrees");
  // The live walk: 500 opening + 3 joined − 1 left by the start of August.
  assert.equal(figures.figure("client_experience_active_clients_at_start"), 502);
  assert.ok(figures.data.values.size > 0, "the month is not blank");

  // Put the real snapshot back for anything after this.
  await publish(AUG);
  assert.ok(await carriedOn(AUG));
});

test("deleting a benchmark does not touch a month already published", async () => {
  // Dom's confirmation, 8 October, before shipping the benchmark delete
  // policy. A benchmark belongs to no month, so the published-month lock
  // cannot reach it — the snapshot is the only thing standing between a
  // deleted benchmark and a traffic light changing on a report the client
  // has read.
  await asMember(db, NINA, () =>
    db.query(`insert into public.report_benchmarks (workspace_id, metric_key, benchmark_value)
              values ('${WS}', 'leads_conversions_new_clients', 7)
              on conflict (workspace_id, metric_key) do update set benchmark_value = 7`),
  );

  await asMember(db, NINA, () =>
    db.query(`update public.report_periods set published_at = null, published_by = null
               where workspace_id = '${WS}' and month = '${SEP}'`),
  );
  await publish(SEP);

  const before = await carriedOn(SEP);
  assert.equal(before.benchmarks["leads_conversions_new_clients"], 7, "frozen at publication");

  // Now take it off — which the new policy lets an editor do.
  await asMember(db, ELIZE, async () => {
    const gone = await db.query(
      `delete from public.report_benchmarks where workspace_id = '${WS}'`,
    );
    assert.ok((gone.affectedRows ?? 0) > 0, "hers to remove, which is the point of the policy");
  });

  const live = await rows(
    `select count(*)::int c from public.report_benchmarks where workspace_id = '${WS}'`,
  );
  assert.equal(live[0].c, 0, "gone from the workspace");

  const after = await carriedOn(SEP);
  assert.deepEqual(after, before, "and the published month carries exactly what it did");
  assert.equal(after.benchmarks["leads_conversions_new_clients"], 7);
});

test("a draft month has no snapshot, and says so as null rather than empty", async () => {
  // `{}` is the column default, so every month looks like that before it
  // is published. null means "work it out live", which is what a draft and
  // a pre-backfill month both need; conflating the two would freeze an
  // empty report onto an old month.
  assert.equal(await carriedOn("2026-10-01"), null);
  assert.equal(readCarried({}), null);
  assert.equal(readCarried(null), null);
  assert.equal(readCarried("nonsense"), null);
});

/**
 * An offer's price, frozen with the month (Dom, 11 November, decision 7).
 *
 * Potential revenue on Leads & Conversions is leads multiplied by the
 * chosen offer's price, and the Offers table on the same report prints
 * that price in its own column. Both read the offer, so without this a
 * price rise would quietly rewrite a report the client read in September
 * — the arithmetic would change under a month the lock is supposed to
 * hold still.
 *
 * Checked through `getMonthFigures`, not just the snapshot, because the
 * snapshot being right is worth nothing if the page does not read it.
 *
 * Last in the file: it republishes September, and the tests above walk
 * the months in a particular order.
 */
let OFFER;

/** The same shape the fallback test builds, for a month and its previous. */
const figuresFor = (month, previous, label) => {
  configure(db, NINA);
  return getMonthFigures({
    workspace: {
      id: WS, kind: "retainer", currency: "GBP",
      hidden_categories: [], track_offer_hours: true,
    },
    month: { month, previous, label },
  });
};

test("an offer's price is frozen too, so a published month keeps the one it used", async () => {
  await asMember(db, NINA, async () => {
    OFFER = (
      await db.query(`insert into public.report_entities
                        (workspace_id, entity_type, name, price, pricing_model)
                      values ('${WS}', 'offer', 'Signature programme', 800, 'one_off')
                      returning id`)
    ).rows[0].id;
  });

  // September is published already; republishing is what takes the
  // snapshot again, with the offer in it this time.
  assert.equal((await publish(SEP))?.error, undefined);
  assert.equal((await carriedOn(SEP)).entities[OFFER].price, 800, "frozen at publish");

  await asMember(db, NINA, () =>
    db.query(`update public.report_entities set price = 900 where id = '${OFFER}'`),
  );

  const published = await figuresFor(SEP, AUG, "September 2026");
  assert.equal(
    published.data.entities.find((e) => e.id === OFFER).price,
    800,
    "the published month still multiplies by the price it was published with",
  );

  const draft = await figuresFor("2026-10-01", SEP, "October 2026");
  assert.equal(
    draft.data.entities.find((e) => e.id === OFFER).price,
    900,
    "and a month that is not published reads today's price",
  );
});

/**
 * The months published before 11 November have no price in their
 * snapshot. They must go on showing the price they have always shown
 * rather than a dash, so an absent price is not a frozen null.
 */
test("a snapshot written before prices were frozen still reads the live one", async () => {
  const [row] = await rows(
    `select carried from public.report_periods where workspace_id = '${WS}' and month = '${SEP}'`,
  );
  const older = structuredClone(row.carried);
  for (const entity of Object.values(older.entities)) delete entity.price;
  await asMember(db, NINA, () =>
    db.query(
      `update public.report_periods set carried = $1
        where workspace_id = '${WS}' and month = '${SEP}'`,
      [JSON.stringify(older)],
    ),
  );

  const figures = await figuresFor(SEP, AUG, "September 2026");
  assert.equal(
    figures.data.entities.find((e) => e.id === OFFER).price,
    900,
    "no price in the snapshot means the live one, not a dash",
  );
});

/**
 * What the forecast says about the months after this one, frozen with the
 * month (Dom, 12 and 13 November).
 *
 * The only forward-looking figure on the report, and the report draws
 * actual against forecast across the year — so live, a published
 * September would move every time somebody revised November's forecast.
 * It is also the only reason a client would need to read months they have
 * not been shown.
 */
test("what a month forecast ahead is frozen, so a revision cannot rewrite it", async () => {
  let ROW;
  await asMember(db, NINA, async () => {
    ROW = (
      await db.query(`insert into public.report_sales_rows (workspace_id, name, row_type)
                      values ('${WS}', 'A retainer client', 'client') returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_forecasts (workspace_id, sales_row_id, month, amount)
                    values ('${WS}', '${ROW}', '${SEP}', 500),
                           ('${WS}', '${ROW}', '2026-10-01', 500),
                           ('${WS}', '${ROW}', '2026-11-01', 500),
                           ('${WS}', '${ROW}', '2026-12-01', 500)`);
  });

  assert.equal((await publish(SEP))?.error, undefined);
  const published = [
    { month: "2026-10-01", amount: 500 },
    { month: "2026-11-01", amount: 500 },
    { month: "2026-12-01", amount: 500 },
  ];
  assert.deepEqual(
    (await carriedOn(SEP)).forecastAhead,
    published,
    "the three months September forecast ahead of itself — not its own",
  );

  // December's forecast is revised upward. It is a draft month, so the
  // change is allowed — and September must not notice.
  await asMember(db, NINA, () =>
    db.query(`update public.report_forecasts set amount = 900
               where sales_row_id = '${ROW}' and month = '2026-12-01'`),
  );
  assert.deepEqual(
    (await carriedOn(SEP)).forecastAhead,
    published,
    "still what it was published with",
  );
});

/**
 * And a month published before 13 November has no `forecastAhead` key at
 * all. Absent is not empty: it must fall back to the live forecast rather
 * than read as "nothing forecast" (the same distinction `entities.price`
 * makes).
 */
test("a snapshot written before the forecast was frozen reads as absent, not empty", async () => {
  const [row] = await rows(
    `select carried from public.report_periods where workspace_id = '${WS}' and month = '${SEP}'`,
  );
  const older = structuredClone(row.carried);
  delete older.forecastAhead;
  assert.equal(readCarried(older).forecastAhead, undefined, "absent stays absent");
  assert.deepEqual(
    readCarried({ ...older, forecastAhead: [] }).forecastAhead,
    [],
    "and a frozen empty forecast is a different answer",
  );
});
