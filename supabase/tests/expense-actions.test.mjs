/**
 * The expense grid: categories down the side, months across.
 *
 * The third grid on Financials, and the one with a rule the other two do
 * not have — **a category feeds one of four buckets, and the figure
 * keeps the bucket it was saved with.** Total costs, Profit and the
 * margin are built on those four, so a client tidying their list must
 * not be redrawing the composition of months that have gone out.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { saveExpenseCategory, saveExpenses, addDefaultCategories } = await import(
  "../../src/lib/reporting/expense-actions.ts"
);
const { getExpenseLedger } = await import("../../src/lib/reporting/expense-queries.ts");
const { DEFAULT_EXPENSE_CATEGORIES } = await import(
  "../../src/lib/reporting/expense-categories.ts"
);

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
const ledger = () => as(ELIZE, () => getExpenseLedger(WS));
const publish = (month, yes = true) =>
  asMember(db, NINA, () =>
    db.query(
      `update public.report_periods
          set published_at = ${yes ? "now()" : "null"}, published_by = ${yes ? `'${NINA}'` : "null"}
        where workspace_id = '${WS}' and month = '${month}'`,
    ),
  );

let SOFTWARE;
let ADS;

test("the usual list goes on in one press, and pressing it twice adds nothing", async () => {
  const first = await as(ELIZE, () => addDefaultCategories(null, form({ workspace_id: WS })));
  assert.match(first?.notice ?? "", /categories added/);

  const { categories } = await ledger();
  assert.equal(categories.length, DEFAULT_EXPENSE_CATEGORIES.length);
  assert.ok(
    categories.every((c) => c.isDefault),
    "and they are marked as the ones that came from the list",
  );
  // The buckets came from the list, not from a guess.
  assert.equal(categories.find((c) => c.name === "Staff")?.bucket, "team");
  assert.equal(categories.find((c) => c.name === "Subscriptions")?.bucket, "fixed");

  const again = await as(ELIZE, () => addDefaultCategories(null, form({ workspace_id: WS })));
  assert.match(again?.notice ?? "", /all on the grid already/);
  assert.equal((await ledger()).categories.length, DEFAULT_EXPENSE_CATEGORIES.length);
});

test("a category of their own, and a name they can change", async () => {
  const added = await as(ELIZE, () =>
    saveExpenseCategory(null, form({ workspace_id: WS, name: "Studio hire", bucket: "fixed" })),
  );
  assert.match(added?.notice ?? "", /Studio hire added/);

  const { categories } = await ledger();
  const mine = categories.find((c) => c.name === "Studio hire");
  assert.equal(mine.bucket, "fixed");
  assert.equal(mine.isDefault, false, "theirs, not the list's");

  const renamed = await as(ELIZE, () =>
    saveExpenseCategory(
      null,
      form({ workspace_id: WS, category_id: mine.id, name: "Studio and storage" }),
    ),
  );
  assert.match(renamed?.notice ?? "", /renamed/);
  assert.equal(
    (await ledger()).categories.find((c) => c.id === mine.id)?.name,
    "Studio and storage",
  );

  const clash = await as(ELIZE, () =>
    saveExpenseCategory(null, form({ workspace_id: WS, name: "Staff", bucket: "team" })),
  );
  assert.match(clash?.error ?? "", /already a category called "Staff"/);

  SOFTWARE = categories.find((c) => c.name === "Software").id;
  ADS = categories.find((c) => c.name === "Ads").id;
});

test("the grid saves in one go, and an empty cell is not a figure of zero", async () => {
  const result = await as(ELIZE, () =>
    saveExpenses(
      null,
      form({
        workspace_id: WS,
        month: JAN,
        [`cell:${SOFTWARE}:${JAN}`]: 120,
        [`cell:${SOFTWARE}:${FEB}`]: "",
        [`cell:${ADS}:${JAN}`]: 400,
      }),
    ),
  );
  assert.equal(result?.notice, "Saved.");

  const { expenses } = await ledger();
  assert.deepEqual(
    expenses.map((e) => [e.month, e.amount, e.bucket]),
    [
      [JAN, 120, "fixed"],
      [JAN, 400, "variable"],
    ],
    "the bucket came off the category, and February is a dash rather than £0",
  );
});

test("a cost cannot be less than nothing, and it says so in words", async () => {
  const refused = await as(ELIZE, () =>
    saveExpenses(null, form({ workspace_id: WS, [`cell:${ADS}:${FEB}`]: -50 })),
  );
  assert.match(refused?.error ?? "", /cannot be less than nothing/);
  assert.equal((await ledger()).expenses.length, 2);
});

test("clearing a cell takes it away", async () => {
  await as(ELIZE, () => saveExpenses(null, form({ workspace_id: WS, [`cell:${ADS}:${JAN}`]: "" })));
  const { expenses } = await ledger();
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].categoryId, SOFTWARE);
});

test("THE POINT: a category that moves bucket does not rewrite the months already saved", async () => {
  // January's £120 of Software was saved as Fixed, and January is
  // published. Moving Software to Team — which the screen does not
  // offer, but the database must still be right about — leaves January
  // exactly as it went out and only decides what NEW figures are.
  await publish(JAN);

  // And a February figure, saved while Software was still Fixed, in a
  // month that is still a draft — so it can be corrected afterwards.
  await as(ELIZE, () =>
    saveExpenses(null, form({ workspace_id: WS, month: FEB, [`cell:${SOFTWARE}:${FEB}`]: 130 })),
  );

  await asMember(db, NINA, () =>
    db.query(
      `update public.report_expense_categories set bucket = 'team' where id = '${SOFTWARE}'`,
    ),
  );

  const { expenses, categories } = await ledger();
  assert.equal(categories.find((c) => c.id === SOFTWARE)?.bucket, "team", "the category moved");
  assert.equal(
    expenses.find((e) => e.month === JAN)?.bucket,
    "fixed",
    "and January is still what it was published as",
  );

  // **And correcting February's amount does not recategorise it
  // either.** The bucket is what it was when the figure was saved, not
  // what the category says the next time somebody touches the row —
  // otherwise tidying the list would rewrite every month anybody edits
  // afterwards, which is the slow version of the same bug.
  await as(ELIZE, () =>
    saveExpenses(null, form({ workspace_id: WS, month: FEB, [`cell:${SOFTWARE}:${FEB}`]: 150 })),
  );
  const corrected = (await ledger()).expenses.find((e) => e.month === FEB);
  assert.equal(corrected?.amount, 150, "the correction went through");
  assert.equal(corrected?.bucket, "fixed", "and it is still Fixed");

  // March is a draft with nothing in it, so a figure saved now is new
  // and takes the bucket the category has today.
  await as(ELIZE, () =>
    saveExpenses(null, form({ workspace_id: WS, month: MAR, [`cell:${SOFTWARE}:${MAR}`]: 140 })),
  );
  assert.equal((await ledger()).expenses.find((e) => e.month === MAR)?.bucket, "team");
});

test("a published month refuses a figure, in words somebody can act on", async () => {
  const refused = await as(ELIZE, () =>
    saveExpenses(null, form({ workspace_id: WS, [`cell:${SOFTWARE}:${JAN}`]: 999 })),
  );
  assert.match(refused?.error ?? "", /published, so its figures are fixed/i);
  assert.equal(
    (await ledger()).expenses.find((e) => e.month === JAN)?.amount,
    120,
    "and the figure the client read is still the one there",
  );
});

test("retiring a category takes it off the grid and keeps every figure", async () => {
  const retired = await as(ELIZE, () =>
    saveExpenseCategory(
      null,
      form({ workspace_id: WS, category_id: ADS, name: "Ads", retire: "yes" }),
    ),
  );
  assert.match(retired?.notice ?? "", /Ads retired/);

  const { categories, expenses } = await ledger();
  assert.equal(categories.find((c) => c.id === ADS)?.active, false);
  assert.equal(categories.length, DEFAULT_EXPENSE_CATEGORIES.length + 1, "nothing was deleted");
  assert.ok(expenses.length > 0, "and the figures are all still there");

  const back = await as(ELIZE, () =>
    saveExpenseCategory(
      null,
      form({ workspace_id: WS, category_id: ADS, name: "Ads", retire: "no" }),
    ),
  );
  assert.match(back?.notice ?? "", /back on the grid/);
  assert.equal((await ledger()).categories.find((c) => c.id === ADS)?.active, true);
});

test("a client reads the grid only once the month is published", async () => {
  configure(db, CLIENT);
  const seen = await getExpenseLedger(WS);
  assert.deepEqual(
    seen.expenses.map((e) => e.month),
    [JAN],
    "January is published; March is a draft and is simply not there",
  );
});

test("a client cannot write a figure of their own", async () => {
  const refused = await as(CLIENT, () =>
    saveExpenses(null, form({ workspace_id: WS, [`cell:${SOFTWARE}:${MAR}`]: 1 })),
  );
  assert.match(refused?.error ?? "", /filled in by your Allegro team/);
});
