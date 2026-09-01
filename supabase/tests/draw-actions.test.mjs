/**
 * The monthly draw, driven through the app's own Server Actions.
 *
 * `schema.test.mjs` already proves the SQL functions are right. This proves the
 * other half — that the buttons reach them and report back correctly — which is
 * exactly where the two bugs found on 1 Sep lived: the SQL was fine, and the
 * screen told Nina to do the thing she had just done.
 *
 * The actions run unmodified. Only their surroundings are substituted: the
 * Supabase client becomes a thin translator onto PGlite (still under RLS, still
 * as a real signed-in member), and Next's `revalidatePath` and `redirect` become
 * stubs. Nothing in `src/` is aware this is a test, which is the only way the
 * result means anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "..", "src");
const stub = (file) => pathToFileURL(path.join(HERE, "stubs", file)).href;

const SUBSTITUTES = new Map([
  ["server-only", stub("server-only.mjs")],
  ["next/cache", stub("next-cache.mjs")],
  ["next/navigation", stub("next-navigation.mjs")],
  ["@/lib/supabase/server", stub("supabase-server.mjs")],
]);

// Must run before the action module is imported, hence the dynamic import below.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const substitute = SUBSTITUTES.get(specifier);
    if (substitute) return { url: substitute, shortCircuit: true };

    // The `@/*` alias from tsconfig, which Node knows nothing about — and the
    // extensions TypeScript lets you leave off, which Node insists on.
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC, specifier.slice(2));
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
      const found = candidates.find((c) => existsSync(c) && !c.endsWith(path.sep));
      if (!found) throw new Error(`Test hook cannot resolve ${specifier}`);
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const { createDraw, runDrawStep } = await import(
  "../../src/lib/admin/draw-actions.ts"
);

const NINA = "11111111-1111-1111-1111-111111111111";
const MARA = "22222222-2222-2222-2222-222222222222";
const OTTO = "33333333-3333-3333-3333-333333333333";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}', 'nina@allegro.test'),
    ('${MARA}', 'mara@test'),
    ('${OTTO}', 'otto@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}', 'nina@allegro.test', 'Nina', 'admin', 'active');
`);

await asMember(db, NINA, async () => {
  await db.query(
    `select public.create_member('${MARA}','mara@test','Mara', now(), now())`,
  );
  await db.query(
    `select public.create_member('${OTTO}','otto@test','Otto', now(), now())`,
  );
  await db.query(`select public.activate_member('${MARA}')`);
  await db.query(`select public.activate_member('${OTTO}')`);
});

// February 2026 has exactly four Mondays. Mara logs eleven hours in each of the
// four weeks; Otto manages three of them and should stay out.
await asMember(db, MARA, () =>
  db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at)
    select '${MARA}', 'client-sessions', d, d + interval '11 hours'
    from (values (timestamptz '2026-02-02 09:00+00'), (timestamptz '2026-02-09 09:00+00'),
                 (timestamptz '2026-02-16 09:00+00'), (timestamptz '2026-02-23 09:00+00')) as v(d)`),
);

await asMember(db, OTTO, () =>
  db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at)
    select '${OTTO}', 'client-sessions', d, d + interval '11 hours'
    from (values (timestamptz '2026-02-02 09:00+00'), (timestamptz '2026-02-09 09:00+00'),
                 (timestamptz '2026-02-16 09:00+00')) as v(d)`),
);

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const drawId = async (month) =>
  (await db.query(`select id from public.draws where draw_month = '${month}'`))
    .rows[0]?.id;

test("an admin sets up a draw", async () => {
  configure(db, NINA);
  const result = await createDraw(
    null,
    form({ draw_month: "2026-02", prize: "A year of Canva Pro", draw_date: "2026-03-03" }),
  );

  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /Draw set up/);
  assert.ok(await drawId("2026-02-01"));
});

test("the same month twice is refused in words, not a stack trace", async () => {
  configure(db, NINA);
  const result = await createDraw(
    null,
    form({ draw_month: "2026-02", prize: "Something else", draw_date: "2026-03-03" }),
  );

  assert.match(result?.error ?? "", /already a draw for that month/);
});

test("a member cannot set up a draw — redirected, not served", async () => {
  configure(db, MARA);
  await assert.rejects(
    () =>
      createDraw(
        null,
        form({ draw_month: "2026-04", prize: "Nope", draw_date: "2026-05-01" }),
      ),
    /REDIRECT:\/piazza/,
  );
});

test("locking entries enters only the member who completed the month", async () => {
  configure(db, NINA);
  const id = await drawId("2026-02-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "open" }));

  assert.equal(result?.error, undefined);
  assert.equal(result?.notice, "1 member entered.");

  const entered = await db.query(
    `select member_id from public.draw_entries where draw_id = '${id}'`,
  );
  assert.deepEqual(entered.rows.map((r) => r.member_id), [MARA]);
});

test("locking again says nobody new, not nobody eligible", async () => {
  configure(db, NINA);
  const id = await drawId("2026-02-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "open" }));

  assert.match(result?.notice ?? "", /Nobody new/);
});

// The bug found on 1 Sep: with nobody eligible, this said "everyone eligible was
// already entered" — which reads as a step already taken rather than a month
// nobody qualified for.
test("a month nobody completed says so, rather than implying entries exist", async () => {
  configure(db, NINA);
  await createDraw(
    null,
    form({ draw_month: "2026-03", prize: "A hamper", draw_date: "2026-04-03" }),
  );
  const id = await drawId("2026-03-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "open" }));

  assert.match(result?.notice ?? "", /Nobody completed the whole month/);
  assert.doesNotMatch(result?.notice ?? "", /already entered/);
});

test("a draw nobody entered refuses to pick a winner, in Nina's words", async () => {
  configure(db, NINA);
  const id = await drawId("2026-03-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "draw" }));

  assert.match(result?.error ?? "", /Nobody is entered/);
  assert.doesNotMatch(result?.error ?? "", /function|SQLSTATE|ERROR:/i);
});

test("drawing picks the winner from the entrants", async () => {
  configure(db, NINA);
  const id = await drawId("2026-02-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "draw" }));

  assert.equal(result?.error, undefined);
  const drawn = await db.query(
    `select winner_member_id, drawn_at from public.draws where id = '${id}'`,
  );
  assert.equal(drawn.rows[0].winner_member_id, MARA);
  assert.ok(drawn.rows[0].drawn_at);
});

// The one that actually matters: a double-click must not produce a second,
// different winner.
test("drawing twice is refused and the winner does not change", async () => {
  configure(db, NINA);
  const id = await drawId("2026-02-01");
  const before = await db.query(
    `select winner_member_id, drawn_at from public.draws where id = '${id}'`,
  );

  const result = await runDrawStep(null, form({ draw_id: id, intent: "draw" }));
  assert.match(result?.error ?? "", /already has a winner/);

  const after = await db.query(
    `select winner_member_id, drawn_at from public.draws where id = '${id}'`,
  );
  assert.deepEqual(after.rows[0], before.rows[0]);
});

test("entries cannot be reopened once drawn", async () => {
  configure(db, NINA);
  const id = await drawId("2026-02-01");
  const result = await runDrawStep(null, form({ draw_id: id, intent: "open" }));

  assert.match(result?.error ?? "", /already been drawn/);
});

test("a member cannot run a draw step", async () => {
  configure(db, MARA);
  const id = await drawId("2026-02-01");
  await assert.rejects(
    () => runDrawStep(null, form({ draw_id: id, intent: "draw" })),
    /REDIRECT:\/piazza/,
  );
});
