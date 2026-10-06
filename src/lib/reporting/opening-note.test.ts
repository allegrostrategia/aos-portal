import assert from "node:assert/strict";
import { test } from "node:test";

import { openingNote } from "./opening-note.ts";

/**
 * What the Client Experience entry screen says, and where it asks.
 *
 * Dom read the handover's step 3 and said it looked backwards — under
 * "earliest wins", August should claim the figure and September should say
 * it is carried. He was right about the rule; these tests are what settles
 * it, because until now the wording had no test at all and the only
 * evidence was me reading my own component.
 */

const AUG = "2026-08-01";
const SEP = "2026-09-01";
const FIRST = AUG;

test("nothing stored: the first month asks, and no other month does", () => {
  assert.deepEqual(
    openingNote({ inUse: null, unused: [], thisMonth: AUG, firstMonth: FIRST, carried: null }),
    { kind: "ask", field: true },
  );

  const elsewhere = openingNote({
    inUse: null, unused: [], thisMonth: SEP, firstMonth: FIRST, carried: null,
  });
  assert.equal(elsewhere.kind, "ask_elsewhere");
  assert.equal(elsewhere.field, false, "no box on the wrong month");
  assert.equal(elsewhere.belongsOn, AUG);
});

test("the month holding the earliest figure says it is the one in use", () => {
  const note = openingNote({
    inUse: { month: AUG, value: 99 },
    unused: [{ month: SEP, value: 20 }],
    thisMonth: AUG,
    firstMonth: FIRST,
    carried: 99,
  });

  assert.equal(note.kind, "in_use");
  assert.equal(note.field, true);
  assert.equal(note.value, 99);
});

test("a later month says it is carried, and names the stray sitting on it", () => {
  // Exactly Dom's reading: 99 in August, 20 in September, so September is
  // the one that says "carried" and flags its own 20 as not in use.
  const note = openingNote({
    inUse: { month: AUG, value: 99 },
    unused: [{ month: SEP, value: 20 }],
    thisMonth: SEP,
    firstMonth: FIRST,
    carried: 104,
  });

  assert.equal(note.kind, "carried");
  assert.equal(note.from, AUG);
  assert.equal(note.value, 99);
  assert.equal(note.carried, 104);
  assert.deepEqual(note.stray, { month: SEP, value: 20 });
  assert.equal(note.field, true, "the box stays, so the stray can be cleared here");
});

test("a carried month with no stray has no box at all", () => {
  const note = openingNote({
    inUse: { month: AUG, value: 99 },
    unused: [],
    thisMonth: SEP,
    firstMonth: FIRST,
    carried: 104,
  });

  assert.equal(note.kind, "carried");
  assert.equal(note.field, false, "nothing to type here, so nothing is asked");
  assert.equal(note.stray, null);
});

test("strays on other months are reported where they are not", () => {
  const note = openingNote({
    inUse: { month: AUG, value: 99 },
    unused: [{ month: "2026-10-01", value: 7 }],
    thisMonth: SEP,
    firstMonth: FIRST,
    carried: 104,
  });

  assert.equal(note.kind, "carried");
  assert.equal(note.stray, null, "none on this month");
  assert.deepEqual(note.otherStrays, [{ month: "2026-10-01", value: 7 }]);
});

test("the field never appears in two months at once", () => {
  // The whole point of Dom's question: Nina must not be prompted twice for
  // one figure. Across a year, exactly one month offers the box — until a
  // stray exists, and then the stray's month offers it so it can be cleared.
  const months = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"];

  const noneStored = months.filter(
    (m) =>
      openingNote({ inUse: null, unused: [], thisMonth: m, firstMonth: FIRST, carried: null })
        .field,
  );
  assert.deepEqual(noneStored, [AUG], "one month asks, and it is the first");

  const stored = months.filter(
    (m) =>
      openingNote({
        inUse: { month: AUG, value: 99 },
        unused: [],
        thisMonth: m,
        firstMonth: FIRST,
        carried: 99,
      }).field,
  );
  assert.deepEqual(stored, [AUG], "and once set, only the month that holds it");
});
