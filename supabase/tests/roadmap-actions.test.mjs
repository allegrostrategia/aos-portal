/**
 * Saving a roadmap, through the app's own action.
 *
 * The rule under test is the one everything else leans on: **an action keeps its
 * id when its wording is unchanged.** `weekly_submissions.actions_taken` and
 * `roadmap_action_notes` both key off those ids, so re-ordering a month, adding
 * a focus or moving an action to a different week must not detach the ticks a
 * member has made or separate them from what they wrote about it.
 *
 * It's also invisible when it breaks. Nothing errors — the roadmap saves, looks
 * right, and a member's history quietly stops belonging to anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveRoadmapStructure, saveActionNote } = await import(
  "../../src/lib/roadmap/actions.ts"
);

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${RUTH}','ruth@test','Ruth Bell', now(), now())`);
  await db.query(`select public.activate_member('${RUTH}')`);
});

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const month = (focusTitle, actions) => [
  { month: 1, title: "First month", focuses: [{ title: focusTitle, actions }] },
];

const stored = async () =>
  (await db.query(`select phases, confirmed_at from public.roadmap where member_id='${RUTH}'`))
    .rows[0];

const actionIds = async () => {
  const { phases } = await stored();
  return phases.flatMap((m) => m.focuses.flatMap((f) => f.actions.map((a) => a.id)));
};

test("a member cannot write a roadmap", async () => {
  configure(db, RUTH);
  await assert.rejects(
    () =>
      saveRoadmapStructure(
        null,
        form({ member_id: RUTH, intent: "publish", months: JSON.stringify(month("F", [{ label: "Mine" }])) }),
      ),
    /REDIRECT:\/piazza/,
  );
});

test("publishing creates the roadmap and marks it confirmed", async () => {
  configure(db, NINA);
  const result = await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up", [
          { label: "Map the current flow", week: 1 },
          { label: "Write the first draft", week: 2 },
        ]),
      ),
    }),
  );

  assert.equal(result?.error, undefined);
  const row = await stored();
  assert.ok(row.confirmed_at);
  assert.equal(row.phases[0].focuses[0].actions.length, 2);
});

test("an empty roadmap is refused rather than wiping what's there", async () => {
  configure(db, NINA);
  const result = await saveRoadmapStructure(
    null,
    form({ member_id: RUTH, intent: "publish", months: "[]" }),
  );

  assert.match(result?.error ?? "", /at least one month/);
  assert.equal((await stored()).phases[0].focuses[0].actions.length, 2);
});

// The rule everything leans on.
test("an unchanged action keeps its id across a re-save", async () => {
  const before = await actionIds();

  configure(db, NINA);
  await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up — renamed focus", [
          { label: "Map the current flow", week: 3 },
          { label: "Write the first draft", week: 2 },
        ]),
      ),
    }),
  );

  assert.deepEqual(await actionIds(), before, "renaming the focus detached the actions");
});

test("moving an action to a different week keeps its id", async () => {
  const { phases } = await stored();
  const moved = phases[0].focuses[0].actions.find((a) => a.label === "Map the current flow");
  assert.equal(moved.week, 3, "the week did change");

  const before = await actionIds();
  configure(db, NINA);
  await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up", [
          { label: "Map the current flow", week: 5 },
          { label: "Write the first draft", week: 2 },
        ]),
      ),
    }),
  );

  assert.deepEqual(await actionIds(), before);
});

test("reordering actions keeps both ids", async () => {
  const before = new Set(await actionIds());

  configure(db, NINA);
  await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up", [
          { label: "Write the first draft", week: 2 },
          { label: "Map the current flow", week: 5 },
        ]),
      ),
    }),
  );

  assert.deepEqual(new Set(await actionIds()), before);
});

// A reworded action is a different action — the thing they ticked isn't the
// thing that's there now, and pretending otherwise is the dishonest answer.
test("a reworded action gets a new id", async () => {
  const before = await actionIds();

  configure(db, NINA);
  await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up", [
          { label: "Map the current enquiry flow end to end", week: 5 },
          { label: "Write the first draft", week: 2 },
        ]),
      ),
    }),
  );

  const after = await actionIds();
  assert.equal(after.length, 2);
  assert.equal(after.filter((id) => before.includes(id)).length, 1);
});

test("a member's note attaches to the action and survives a re-save", async () => {
  const { phases } = await stored();
  const roadmapId = (await db.query(
    `select id from public.roadmap where member_id='${RUTH}'`,
  )).rows[0].id;
  const actionId = phases[0].focuses[0].actions[0].id;

  configure(db, RUTH);
  await saveActionNote(
    null,
    form({ roadmap_id: roadmapId, action_id: actionId, body: "Took longer than expected." }),
  );

  configure(db, NINA);
  await saveRoadmapStructure(
    null,
    form({
      member_id: RUTH,
      intent: "publish",
      months: JSON.stringify(
        month("Automate follow-up", [
          { label: "Map the current enquiry flow end to end", week: 1 },
          { label: "Write the first draft", week: 2 },
        ]),
      ),
    }),
  );

  const note = await db.query(
    `select body from public.roadmap_action_notes where action_id='${actionId}'`,
  );
  const stillThere = (await actionIds()).includes(actionId);
  assert.equal(note.rows.length, 1);
  assert.ok(stillThere, "the note's action vanished from the roadmap");
});

test("clearing a note removes it rather than storing an empty one", async () => {
  const roadmapId = (await db.query(
    `select id from public.roadmap where member_id='${RUTH}'`,
  )).rows[0].id;
  const actionId = (await actionIds())[0];

  configure(db, RUTH);
  await saveActionNote(null, form({ roadmap_id: roadmapId, action_id: actionId, body: "   " }));

  const note = await db.query(
    `select count(*)::int c from public.roadmap_action_notes where action_id='${actionId}'`,
  );
  assert.equal(note.rows[0].c, 0);
});
