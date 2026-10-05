/**
 * §5.8's opening figure, through the real action and the real policies.
 *
 * The question this answers for Dom (5 Oct): **who can type it?** Nobody
 * decided that separately — it falls out of the policy that was already
 * there. `report_values` admits an insert when `report_can_edit()` is true,
 * which is an admin, an assigned team member, and a self-serve client, but
 * **never a retainer client** (§2: they view and comment, Allegro enters).
 * So the opening figure is Nina's or Elize's, and asserted as all three
 * here rather than reasoned about.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { activeClientsAtStart, openingFigures } = await import(
  "../../src/lib/reporting/client-flow.ts"
);
const { getClientFlow } = await import("../../src/lib/reporting/queries.ts");
const { resolveReportContext } = await import("../../src/lib/reporting/context.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const MEMBER = "44444444-4444-4444-4444-444444444444";

const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";

const OPENING = "client_experience_clients_at_start_opening";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test'),
    ('${MEMBER}','ruth@member.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth','member','active');
`);

let retainer;
let selfServe;
await asMember(db, NINA, async () => {
  retainer = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Bella Ltd', 'Bella Rossi', '${JAN}')).id as id`)
  ).rows[0].id;
  await db.query(
    `select public.assign_report_team_member('${retainer}', '${ELIZE}', 'Elize')`,
  );
  selfServe = (
    await db.query(`select (public.create_report_workspace(
      '${MEMBER}', 'aos_member', 'Ruth Coaching', 'Ruth', '${JAN}')).id as id`)
  ).rows[0].id;
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
const rows = async (uid, sql) => (await asMember(db, uid, () => db.query(sql))).rows;

// The entry form names its fields "v:<metric key>", so a test that posts
// the bare key saves nothing and says "Nothing to save".
const saveOpening = (uid, workspace, month, value) =>
  as(uid, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: workspace,
        month,
        category: "client_experience",
        [`v:${OPENING}`]: value,
      }),
    ),
  );

// ------------------------------------------------------------------- the metric

test("the opening metric exists and is typeable, unlike the one it stands in for", async () => {
  const [opening] = await rows(NINA,
    `select input_type::text t from public.report_metrics where key = '${OPENING}'`);
  assert.equal(opening.t, "core", "core, so report_values will store it");

  const [pulled] = await rows(NINA, `
    select input_type::text t from public.report_metrics
     where key = 'client_experience_active_clients_at_start'`);
  assert.equal(pulled.t, "pulled");

  // The reason the opening figure had to exist at all.
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () =>
        db.query(`
          insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
          values ('${retainer}', '${JAN}', 'client_experience_active_clients_at_start', 40, '${NINA}')`),
      /worked out rather than stored/,
    );
  });
});

// -------------------------------------------------------------------- who may

test("Nina can type the opening figure", async () => {
  const result = await saveOpening(NINA, retainer, JAN, 10);
  assert.equal(result?.error, undefined, result?.error);

  const [row] = await rows(NINA, `
    select value::float v from public.report_values
     where workspace_id = '${retainer}' and month = '${JAN}' and metric_key = '${OPENING}'`);
  assert.equal(row.v, 10);
});

test("an assigned team member can too", async () => {
  const result = await saveOpening(ELIZE, retainer, JAN, 12);
  assert.equal(result?.error, undefined, result?.error);

  const [row] = await rows(NINA, `
    select value::float v from public.report_values
     where workspace_id = '${retainer}' and month = '${JAN}' and metric_key = '${OPENING}'`);
  assert.equal(row.v, 12, "Elize's correction stands");
});

test("the retainer client cannot — they view and comment (§2)", async () => {
  const result = await saveOpening(CLIENT, retainer, JAN, 999);
  assert.ok(result?.error, "refused with a reason, not silently");

  const [row] = await rows(NINA, `
    select value::float v from public.report_values
     where workspace_id = '${retainer}' and month = '${JAN}' and metric_key = '${OPENING}'`);
  assert.equal(row.v, 12, "unchanged");

  // And not around the action either.
  await asMember(db, CLIENT, async () => {
    await assert.rejects(
      () =>
        db.query(`
          insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
          values ('${retainer}', '${FEB}', '${OPENING}', 999, '${CLIENT}')`),
      /row-level security|violates/i,
    );
  });
});

test("a self-serve member can, on their own workspace", async () => {
  // They enter their own figures (§2), so the opening figure is theirs.
  const result = await saveOpening(MEMBER, selfServe, JAN, 5);
  assert.equal(result?.error, undefined, result?.error);

  const [row] = await rows(NINA, `
    select value::float v from public.report_values
     where workspace_id = '${selfServe}' and month = '${JAN}' and metric_key = '${OPENING}'`);
  assert.equal(row.v, 5);
});

// ------------------------------------------------------------------ the chain

test("every later month carries on from the month before", async () => {
  await as(NINA, () =>
    saveCategoryValues(null, form({
      workspace_id: retainer, month: JAN, category: "client_experience",
      "v:client_experience_clients_who_left": 1,
    })),
  );
  await as(NINA, () =>
    saveCategoryValues(null, form({
      workspace_id: retainer, month: JAN, category: "leads_conversions",
      "v:leads_conversions_new_clients": 3,
    })),
  );

  configure(db, NINA);
  const flow = await getClientFlow(retainer, MAR);

  assert.equal(activeClientsAtStart(flow, JAN), 12, "the typed figure");
  assert.equal(activeClientsAtStart(flow, FEB), 14, "12 + 3 − 1");
});

const publish = (month) =>
  asMember(db, NINA, () =>
    db.query(`
      insert into public.report_periods (workspace_id, month, published_at, published_by)
      values ('${retainer}', '${month}', now(), '${NINA}')
      on conflict (workspace_id, month)
        do update set published_at = now(), published_by = '${NINA}'`),
  );

test("a client whose opening month is not published sees a dash, not a guess", async () => {
  // **The chain is only as long as what the reader can see.** RLS hands a
  // retainer client published months and nothing else, so with January a
  // draft they cannot see the opening figure the team is working from.
  // The honest answer is then a dash — the figure is not theirs to read
  // yet. A number derived from half the history would be worse than none,
  // because it would disagree with the one on the team's screen (§9).
  await publish(FEB);

  configure(db, CLIENT);
  const partial = await getClientFlow(retainer, FEB);
  assert.equal(
    activeClientsAtStart(partial, FEB),
    null,
    "January is a draft, so its opening figure is not theirs to read",
  );
});

test("once the earlier months are published too, they read what the team reads", async () => {
  await publish(JAN);

  configure(db, CLIENT);
  const asClient = await getClientFlow(retainer, FEB);
  configure(db, NINA);
  const asNina = await getClientFlow(retainer, FEB);

  assert.equal(activeClientsAtStart(asClient, FEB), 14);
  assert.equal(
    activeClientsAtStart(asClient, FEB),
    activeClientsAtStart(asNina, FEB),
    "§9: the client's report and the team's must never disagree",
  );
});

test("a client reads nothing from an unpublished month, so no chain either", async () => {
  configure(db, CLIENT);
  const flow = await getClientFlow(retainer, MAR);
  // March is a draft: RLS hands them nothing for it. January and February
  // are theirs, so the chain up to March still resolves — what they must
  // not get is a draft month's figures.
  assert.ok(
    flow.every((m) => m.month <= FEB),
    `a draft month leaked into the client's flow: ${JSON.stringify(flow)}`,
  );
});

test("a second opening figure is not used, and is reported", async () => {
  await saveOpening(NINA, retainer, FEB, 500);

  configure(db, NINA);
  const flow = await getClientFlow(retainer, MAR);
  const { inUse, unused } = openingFigures(flow);

  assert.deepEqual(inUse, { month: JAN, value: 12 }, "the earliest wins");
  assert.deepEqual(unused, [{ month: FEB, value: 500 }], "and the other is named");
  assert.equal(activeClientsAtStart(flow, MAR), 14, "500 changed nothing");
});

test("the whole page gets the figure, not just the helper", async () => {
  // End to end through getMonthFigures, because everything above tests the
  // resolver and nothing tested that the page is handed its answer. Without
  // this, dropping `clientsAtStart` from the calculate() call left every
  // retention figure null again and no test noticed.
  // February needs its own two figures: without them "active at end" is
  // genuinely unknown, and §4 says that is a dash rather than "the same as
  // the start". Entering nought of each is the real scenario for a quiet
  // month.
  await as(NINA, () =>
    saveCategoryValues(null, form({
      workspace_id: retainer, month: FEB, category: "client_experience",
      "v:client_experience_clients_who_left": 0,
    })),
  );
  await as(NINA, () =>
    saveCategoryValues(null, form({
      workspace_id: retainer, month: FEB, category: "leads_conversions",
      "v:leads_conversions_new_clients": 0,
    })),
  );

  configure(db, NINA);
  const ctx = await resolveReportContext(
    { workspace: retainer, month: "2026-02" },
    "2026-03-02",
  );
  const figures = await getMonthFigures(ctx);

  assert.equal(figures.figure("client_experience_active_clients_at_start"), 14);
  assert.equal(
    figures.figure("client_experience_active_clients_at_end"),
    14,
    "nothing joined or left in February",
  );
  assert.equal(figures.figure("client_experience_retention_rate"), 100);
  assert.equal(figures.figure("client_experience_churn_rate"), 0);

  // And the opening figures come back with it, for the entry screen's note.
  assert.deepEqual(figures.openingClients.inUse, { month: JAN, value: 12 });
});

