import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteEntityMessage } from "./entity-delete.ts";

test("a restrict refusal becomes an instruction, not a constraint name", () => {
  const message = deleteEntityMessage(
    { code: "23503", message: 'violates RESTRICT setting of foreign key constraint "report_values_entity_id_fkey"' },
    "offer",
  );
  assert.match(message ?? "", /already gone out/);
  assert.match(message ?? "", /Retire this offer/);
  assert.doesNotMatch(message ?? "", /constraint|foreign key|23503/i);
});

test("each kind names its own button", () => {
  assert.match(deleteEntityMessage({ code: "23503" }, "campaign") ?? "", /Retire this campaign/);
  assert.match(deleteEntityMessage({ code: "23503" }, "funnel") ?? "", /Retire this funnel/);
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
