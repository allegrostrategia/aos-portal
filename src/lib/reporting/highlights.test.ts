import assert from "node:assert/strict";
import { test } from "node:test";

import { TEMPLATES, highlightFor, highlights, pluralise } from "./highlights.ts";

/**
 * "Look at these first 👀" and "What went WELL this month".
 *
 * Nina's eight sentences, given verbatim. The tests that matter are
 * that the wording is hers to the character, that one of something
 * reads as one of something, that a figure where falling is the good
 * news says so, and that nothing is said about a figure there is
 * nothing to say about.
 */

const base = {
  unit: "count" as const,
  goodDirection: "up" as const,
  currency: "GBP",
  previous: null as number | null,
  target: null as number | null,
};

test("the eight sentences are Nina's, to the character", () => {
  // If these ever need changing they change in one file, which is the
  // point of the file. They do not get reworded by a screen.
  assert.equal(TEMPLATES.countDown, "{n} fewer {metric} than last month - worth a proper look 👀");
  assert.equal(TEMPLATES.countUp, "{n} MORE {metric} than last month - stunning");
  assert.equal(TEMPLATES.rateDown, "{Metric} dropped from {from} to {to}... let's work out WHY");
  assert.equal(TEMPLATES.rateUp, "{Metric} up from {from} to {to} & that's no accident");
  assert.equal(TEMPLATES.belowTarget, "{Metric} is at {pct} of your target - not there YET");
  assert.equal(TEMPLATES.beatTarget, "{Metric} beat your target by {pct} WOOOO");
  assert.equal(TEMPLATES.goodFall, "{Metric} down {n} - exactly the direction we want");
  assert.equal(
    TEMPLATES.badRise,
    "{Metric} up {n} - not the direction we want, let's dig into WHY",
  );
});

test("one more new client, not one more new clients", () => {
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 5, previous: 4 })?.text,
    "1 MORE new client than last month - stunning",
  );
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 7, previous: 4 })?.text,
    "3 MORE new clients than last month - stunning",
  );
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 3, previous: 4 })?.text,
    "1 fewer new client than last month - worth a proper look 👀",
  );
});

test("plurals that are not plurals are left alone", () => {
  assert.equal(pluralise("Opt-ins", 1), "opt-in");
  assert.equal(pluralise("Revenue", 1), "revenue", "no trailing s to drop");
  assert.equal(pluralise("Gross", 1), "gross", "ends in ss, so it is not a plural");
  assert.equal(pluralise("New clients", 2), "new clients", "lower case: it sits mid-sentence");
});

test("a rate moves from one figure to another", () => {
  const down = highlightFor({
    ...base,
    label: "Opt-in rate",
    unit: "percent",
    value: 28,
    previous: 35,
  });
  assert.equal(down?.text, "Opt-in rate dropped from 35.0% to 28.0%... let's work out WHY");
  assert.equal(down?.panel, "attention");

  const up = highlightFor({
    ...base,
    label: "Opt-in rate",
    unit: "percent",
    value: 41,
    previous: 35,
  });
  assert.equal(up?.text, "Opt-in rate up from 35.0% to 41.0% & that's no accident");
  assert.equal(up?.panel, "wins");
});

test("a churn rate falling is exactly the direction we want", () => {
  const fell = highlightFor({
    ...base,
    label: "Churn rate",
    unit: "percent",
    goodDirection: "down",
    value: 3,
    previous: 8,
  });
  assert.equal(fell?.text, "Churn rate down 5.0% - exactly the direction we want");
  assert.equal(fell?.panel, "wins");

  const rose = highlightFor({
    ...base,
    label: "Churn rate",
    unit: "percent",
    goodDirection: "down",
    value: 8,
    previous: 3,
  });
  assert.equal(
    rose?.text,
    "Churn rate up 5.0% - not the direction we want, let's dig into WHY",
  );
  assert.equal(rose?.panel, "attention");
});

test("cost per lead keeps its pennies in the sentence", () => {
  // The change, formatted as the card formats it (§10.2): £1.50, not
  // £2 and not -1.5. Under a thousand and not round keeps the pennies.
  const fell = highlightFor({
    ...base,
    label: "Cost per lead",
    unit: "currency",
    goodDirection: "down",
    value: 4.5,
    previous: 6,
  });
  assert.equal(fell?.text, "Cost per lead down £1.50 - exactly the direction we want");
  assert.equal(fell?.panel, "wins");

  const rose = highlightFor({
    ...base,
    label: "Cost per lead",
    unit: "currency",
    goodDirection: "down",
    value: 6,
    previous: 4.5,
  });
  assert.equal(
    rose?.text,
    "Cost per lead up £1.50 - not the direction we want, let's dig into WHY",
  );
  assert.equal(rose?.panel, "attention");
});

test("the sentence that started this: clients who left", () => {
  // Two fewer clients leaving used to come out as "2 MORE clients who
  // left than last month - stunning". It now reads as the good news it
  // is, and the rise reads as the bad news it is.
  const fell = highlightFor({
    ...base,
    label: "Clients who left",
    goodDirection: "down",
    value: 1,
    previous: 3,
  });
  assert.equal(fell?.text, "Clients who left down 2 - exactly the direction we want");
  assert.equal(fell?.panel, "wins");
  assert.ok(!fell?.text.includes("stunning"), "the old sentence is gone, not merely outvoted");

  const rose = highlightFor({
    ...base,
    label: "Clients who left",
    goodDirection: "down",
    value: 3,
    previous: 1,
  });
  assert.equal(
    rose?.text,
    "Clients who left up 2 - not the direction we want, let's dig into WHY",
  );
  assert.equal(rose?.panel, "attention");
});

test("a target still beats the movement sentence on a good-down figure", () => {
  const onTarget = highlightFor({
    ...base,
    label: "Cost per lead",
    unit: "currency",
    goodDirection: "down",
    value: 4.5,
    previous: 6,
    target: 5,
  });
  assert.equal(onTarget?.text, "Cost per lead beat your target by 10% WOOOO");
});

test("one sentence per figure, even when two metrics share a name", () => {
  // "New clients" is both Leads' own figure and Client Experience's
  // copy of it. Two sentences would read as two pieces of news.
  const { wins } = highlights([
    { ...base, label: "New clients", value: 8, previous: 4 },
    { ...base, label: "New clients", value: 8, previous: 4 },
  ]);
  assert.equal(wins.length, 1);
});

test("a target beats a comparison with last month", () => {
  const h = highlightFor({
    ...base,
    label: "New clients",
    value: 6,
    previous: 2,
    target: 10,
  });
  assert.equal(h?.key, "belowTarget");
  assert.equal(h?.text, "New clients is at 60% of your target - not there YET");
});

test("beating a target says by how much, not how much of it", () => {
  const h = highlightFor({ ...base, label: "New clients", value: 12, target: 10 });
  assert.equal(h?.text, "New clients beat your target by 20% WOOOO");
  assert.equal(h?.panel, "wins");
});

test("nothing is said where there is nothing to say", () => {
  assert.equal(highlightFor({ ...base, label: "New clients", value: null }), null);
  assert.equal(highlightFor({ ...base, label: "New clients", value: 4, previous: 4 }), null);
  assert.equal(
    highlightFor({ ...base, label: "Cash in bank", goodDirection: "none", value: 10, previous: 2 }),
    null,
    "a figure that is neither good up nor down has no news in it",
  );
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 10, target: 10 })?.key,
    undefined,
    "exactly on target is not a 0% win",
  );
});

test("the panels take the biggest movements, three each", () => {
  const inputs = [
    { ...base, label: "A", value: 2, previous: 10 },
    { ...base, label: "B", value: 9, previous: 10 },
    { ...base, label: "C", value: 5, previous: 10 },
    { ...base, label: "D", value: 1, previous: 10 },
    { ...base, label: "E", value: 20, previous: 10 },
    { ...base, label: "F", value: 11, previous: 10 },
  ];
  const { attention, wins } = highlights(inputs);

  assert.equal(attention.length, 3, "three, because eleven things to look at first is none");
  assert.equal(wins.length, 2);
  assert.ok(
    attention[0].text.startsWith("9 fewer"),
    `biggest first, got "${attention[0].text}"`,
  );
});
