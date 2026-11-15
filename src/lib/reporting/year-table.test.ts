import assert from "node:assert/strict";
import { test } from "node:test";

import { buildYearRows, calendarYear, summarise, summaryLabel } from "./year-table.ts";

const metric = (key: string, label: string, unit: string) =>
  ({ key, label, unit, category: "email", input_type: "core", good_direction: "up",
     entity_type: null, formula: null, sort_order: 1 }) as never;

test("the calendar year, January first, whatever month is being read", () => {
  assert.deepEqual(calendarYear("2026-07-01").slice(0, 2), ["2026-01-01", "2026-02-01"]);
  assert.equal(calendarYear("2026-07-01").length, 12);
  assert.equal(calendarYear("2026-01-01")[11], "2026-12-01");
});

test("counts and money add up", () => {
  assert.deepEqual(summarise("count", [1, 2, 3]), { value: 6, kind: "total" });
  assert.deepEqual(summarise("currency", [100, 200]), { value: 300, kind: "total" });
});

test("a year of percentages does not add up — it averages", () => {
  // Twelve months of a 40% open rate is 40%, not 480%.
  assert.deepEqual(summarise("percent", [40, 40, 40]), { value: 40, kind: "average" });
});

test("the average is over the months that have a figure, not over twelve", () => {
  // A client who started in June is not averaged against five blanks.
  const out = summarise("percent", [null, null, 50, 30, null]);
  assert.equal(out.value, 40);
});

test("nothing entered all year is a blank summary, not a zero", () => {
  assert.deepEqual(summarise("count", [null, null]), { value: null, kind: "total" });
});

test("a level takes its last reading, because a year of followers is not a sum", () => {
  const history = new Map([["email_list_size_at_month_end", [100, 200, 300, null]]]);
  const [row] = buildYearRows([metric("email_list_size_at_month_end", "List size at month end", "count")], history);
  assert.equal(row.summary.value, 300, "the sum would have said 600");
  assert.equal(summaryLabel(row), "Latest");
});

test("a row with nothing in it all year is left out", () => {
  const history = new Map([["email_new_subscribers", [null, null]]]);
  assert.deepEqual(buildYearRows([metric("email_new_subscribers", "New subscribers", "count")], history), []);
});

test("a missing key is blanks, not a crash", () => {
  const rows = buildYearRows([metric("email_emails_sent", "Emails sent", "count")], new Map());
  assert.deepEqual(rows, []);
});
