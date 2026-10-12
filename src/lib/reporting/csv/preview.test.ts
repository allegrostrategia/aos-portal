import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPreview } from "./preview.ts";

const labels = { ads_spend: "Spend", ads_leads: "Leads", ads_impressions: "Impressions" };
const result = {
  figures: { ads_spend: 600, ads_leads: 100, ads_impressions: 60000 },
  cannotFill: ["Reach"],
  rowsUsed: 5,
  rowsOutsideMonth: 4,
};

test("an empty box is new, a matching one is unchanged", () => {
  const preview = buildPreview(result, { ads_spend: null, ads_leads: 100 }, labels);
  const by = Object.fromEntries(preview.rows.map((r) => [r.key, r.status]));
  assert.equal(by.ads_spend, "new");
  assert.equal(by.ads_leads, "same", "the same number is not a change");
  assert.equal(by.ads_impressions, "new", "a box nobody has touched is new");
  assert.deepEqual(preview.changed, []);
});

test("a box holding a different number is listed as old → new", () => {
  // The case this exists for: somebody typed 450, or corrected it after
  // the last upload. A file replacing it unseen is the one thing an
  // import must never do.
  const preview = buildPreview(result, { ads_spend: 450, ads_leads: 100 }, labels);
  assert.deepEqual(preview.changed, [
    { key: "ads_spend", label: "Spend", status: "changed", from: 450, to: 600 },
  ]);
});

test("a hand-typed zero is a number, not an empty box", () => {
  // §4's rule the other way round: somebody who typed 0 meant 0, and
  // replacing it with 600 is a change they should see.
  const preview = buildPreview(result, { ads_spend: 0 }, labels);
  assert.equal(preview.changed.length, 1);
  assert.deepEqual(
    preview.changed[0],
    { key: "ads_spend", label: "Spend", status: "changed", from: 0, to: 600 },
  );
});

test("a refused file previews nothing at all", () => {
  const preview = buildPreview(
    { ...result, problem: "That file covers August." },
    { ads_spend: 450 },
    labels,
  );
  assert.equal(preview.problem, "That file covers August.");
  assert.deepEqual(preview.rows, []);
  assert.deepEqual(preview.changed, [], "and nothing is offered to confirm");
});

test("the labels are the ones on screen, not the metric keys", () => {
  const preview = buildPreview(result, {}, labels);
  assert.deepEqual(preview.rows.map((r) => r.label).sort(), ["Impressions", "Leads", "Spend"]);
  // A key with no label falls back to itself rather than to blank.
  const odd = buildPreview({ ...result, figures: { ads_made_up: 1 } }, {}, labels);
  assert.equal(odd.rows[0].label, "ads_made_up");
});
