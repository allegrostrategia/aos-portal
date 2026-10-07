import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteEntityMessage } from "./entity-delete.ts";

test("a restrict refusal becomes an instruction, not a constraint name", () => {
  const message = deleteEntityMessage(
    { code: "23503", message: 'violates RESTRICT setting of foreign key constraint "report_values_entity_id_fkey"' },
    "offer",
  );
  assert.equal(
    message,
    "This offer has figures saved against it, so deleting it would take them " +
      "off its reports. Use \u201cRetire this offer\u201d instead. It comes off " +
      "the entry screens and the history stays.",
  );
  assert.doesNotMatch(message ?? "", /constraint|foreign key|23503/i);
});

test("each kind names itself, twice, in its own words", () => {
  // `restrict` is on report_values.entity_id, which carries offers,
  // campaigns and funnels alike — so all three can meet this.
  for (const what of ["offer", "campaign", "funnel"] as const) {
    const m = deleteEntityMessage({ code: "23503" }, what) ?? "";
    assert.match(m, new RegExp(`^This ${what} has figures saved against it`));
    assert.match(m, new RegExp(`Retire this ${what}`));
  }
});

test("it does not promise the figures are only on published months", () => {
  // The first draft said "months that have already gone out". Restrict
  // fires on any referencing row, so a draft month's figures block the
  // delete just the same, and the sentence would have been a lie in the
  // commonest case.
  const m = deleteEntityMessage({ code: "23503" }, "funnel") ?? "";
  assert.doesNotMatch(m, /published|gone out|client has read/i);
});

test("any other failure is left alone to say what it is", () => {
  // Matching too eagerly would hide a real error behind advice that does
  // not apply — "retire it instead" is wrong if the database is down.
  assert.equal(deleteEntityMessage({ code: "42501", message: "permission denied" }, "offer"), null);
  assert.equal(deleteEntityMessage({ message: "network error" }, "offer"), null);
  assert.equal(deleteEntityMessage({ code: null }, "offer"), null);
});

test("the code is what is matched, not the wording", () => {
  // Postgres's message for 23503 names the constraint and the table and has
  // changed between major versions. A message match would stop working one
  // upgrade from now, silently.
  assert.ok(deleteEntityMessage({ code: "23503", message: "" }, "offer"));
});
