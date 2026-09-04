import assert from "node:assert/strict";
import { test } from "node:test";

import { actionsByWeek, allActions, readRoadmap } from "./shape.ts";

test("the current shape reads back whole", () => {
  const months = readRoadmap([
    {
      month: 1,
      title: "Get the enquiries under control",
      focuses: [
        {
          id: "f1",
          title: "Automate follow-up",
          station_slug: "officina-vespa",
          actions: [
            { id: "a1", label: "Map the current flow", training_id: "t1", week: 2 },
          ],
        },
      ],
    },
  ]);

  assert.equal(months.length, 1);
  assert.equal(months[0].title, "Get the enquiries under control");
  assert.equal(months[0].focuses[0].stationSlug, "officina-vespa");
  assert.deepEqual(months[0].focuses[0].actions[0], {
    id: "a1",
    label: "Map the current flow",
    trainingId: "t1",
    week: 2,
  });
});

// The old shape is already on live. Reading it rather than migrating means no
// script has to be right about real members' plans.
test("a legacy phase becomes a month with one focus", () => {
  const months = readRoadmap([
    {
      title: "Foundations",
      station_slug: "studio-dell-architetto",
      items: [{ id: "old-1", label: "Write the process down" }],
    },
  ]);

  assert.equal(months.length, 1);
  assert.equal(months[0].focuses.length, 1);
  assert.equal(months[0].focuses[0].title, "Foundations");
  assert.equal(months[0].focuses[0].stationSlug, "studio-dell-architetto");
  assert.equal(months[0].focuses[0].actions[0].label, "Write the process down");
});

// The key the weekly log has written since Step 5. Changing it would orphan
// every tick a member has already made.
test("a legacy item without an id keeps the phase:item fallback key", () => {
  const months = readRoadmap([
    { title: "Foundations", items: ["Write the process down"] },
    { title: "Second", items: ["A", "B"] },
  ]);

  assert.equal(months[0].focuses[0].actions[0].id, "0:0");
  assert.equal(months[1].focuses[0].actions[1].id, "1:1");
});

test("an explicit id always wins over the fallback", () => {
  const months = readRoadmap([
    { title: "Foundations", items: [{ id: "kept", label: "Something" }] },
  ]);
  assert.equal(months[0].focuses[0].actions[0].id, "kept");
});

test("legacy items could be bare strings, and still read", () => {
  const months = readRoadmap([{ title: "P", items: ["Just text"] }]);
  assert.equal(months[0].focuses[0].actions[0].label, "Just text");
  assert.equal(months[0].focuses[0].actions[0].trainingId, null);
});

test("garbage in the column doesn't throw", () => {
  for (const value of [null, undefined, "text", 42, {}, [null, 3, "x"]]) {
    assert.deepEqual(readRoadmap(value), []);
  }
});

test("a week outside 1–5 is treated as unset rather than trusted", () => {
  const read = (week: unknown) =>
    readRoadmap([
      { focuses: [{ title: "F", actions: [{ id: "a", label: "L", week }] }] },
    ])[0].focuses[0].actions[0].week;

  assert.equal(read(0), null);
  assert.equal(read(6), null);
  assert.equal(read(2.5), null);
  assert.equal(read("three"), null);
  assert.equal(read(3), 3);
});

test("actions with no label are dropped, not rendered blank", () => {
  const months = readRoadmap([
    { focuses: [{ title: "F", actions: [{ id: "a", label: "  " }, { id: "b", label: "Real" }] }] },
  ]);
  assert.equal(months[0].focuses[0].actions.length, 1);
  assert.equal(months[0].focuses[0].actions[0].label, "Real");
});

test("month position falls back to order when not declared", () => {
  const months = readRoadmap([
    { title: "First", focuses: [] },
    { title: "Second", focuses: [] },
  ]);
  assert.deepEqual(months.map((m) => m.month), [1, 2]);
});

test("every action can be walked in reading order", () => {
  const months = readRoadmap([
    {
      focuses: [
        { title: "A", actions: [{ id: "1", label: "one" }, { id: "2", label: "two" }] },
        { title: "B", actions: [{ id: "3", label: "three" }] },
      ],
    },
  ]);
  assert.deepEqual(allActions(months).map((a) => a.action.id), ["1", "2", "3"]);
});

// An unscheduled action is a real state — filing it under week one would be
// inventing a decision Nina hasn't made.
test("actions with no week are kept, grouped under null", () => {
  const months = readRoadmap([
    {
      focuses: [
        {
          title: "A",
          actions: [
            { id: "1", label: "scheduled", week: 2 },
            { id: "2", label: "not scheduled" },
          ],
        },
      ],
    },
  ]);

  const byWeek = actionsByWeek(months[0]);
  assert.deepEqual(byWeek.get(2)?.map((a) => a.id), ["1"]);
  assert.deepEqual(byWeek.get(null)?.map((a) => a.id), ["2"]);
});
