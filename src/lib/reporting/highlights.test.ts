import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DERIVED_FROM,
  FOCUS_FLOORS,
  FOCUS_TAG,
  PULLED_FROM,
  TEMPLATES,
  clearsFloors,
  floorFor,
  highlightFor,
  highlights,
  pluralise,
} from "./highlights.ts";

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
  assert.equal(TEMPLATES.countDown, "{n} fewer {metric} than last month");
  assert.equal(TEMPLATES.countUp, "{n} MORE {metric} than last month - stunning");
  assert.equal(TEMPLATES.rateDown, "{Metric} dropped from {from} to {to}");
  assert.equal(TEMPLATES.rateUp, "{Metric} up from {from} to {to} & that's no accident");
  assert.equal(TEMPLATES.belowTarget, "{Metric} is at {pct} of your target");
  assert.equal(TEMPLATES.beatTarget, "{Metric} beat your target by {pct} WOOOO");
  assert.equal(TEMPLATES.goodFall, "{Metric} down {n} - exactly the direction we want");
  assert.equal(
    TEMPLATES.badRise,
    "{Metric} up {n}",
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
    "1 fewer new client than last month",
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
  assert.equal(down?.text, "Opt-in rate dropped from 35.0% to 28.0%");
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
    "Churn rate up 5.0%",
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
    "Cost per lead up £1.50",
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
    "Clients who left up 2",
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
  assert.equal(h?.text, "New clients is at 60% of your target");
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

test("a rate drops out when its own count is saying the same thing", () => {
  // Dom's case, 7 October: "Issues raised up 3" and "Issues per 10 clients
  // up 1.0" are one event described twice. The count stays, being the
  // plain one.
  const { attention } = highlights([
    {
      ...base,
      key: "client_experience_issues_raised",
      label: "Issues raised",
      goodDirection: "down",
      value: 4,
      previous: 1,
    },
    {
      ...base,
      key: "client_experience_issues_per_10_clients",
      label: "Issues per 10 clients",
      unit: "ratio",
      goodDirection: "down",
      value: 2,
      previous: 1,
    },
  ]);

  assert.equal(attention.length, 1);
  assert.match(attention[0].text, /^Issues raised up 3/);
});

test("but it stays when the two are telling different stories", () => {
  // New clients up while the close rate falls is not one event: more calls
  // converting worse. Different panels, so both are news. The rule keys on
  // the panel for exactly this.
  const { wins, attention } = highlights([
    {
      ...base,
      key: "leads_conversions_new_clients",
      label: "New clients",
      value: 8,
      previous: 4,
    },
    {
      ...base,
      key: "leads_conversions_close_rate",
      label: "Close rate",
      unit: "percent",
      value: 12,
      previous: 30,
    },
  ]);

  assert.equal(wins.length, 1, "the count is a win");
  assert.equal(attention.length, 1, "and the rate is still worth a look");
  assert.match(wins[0].text, /4 MORE new clients/);
  assert.match(attention[0].text, /Close rate dropped from 30.0% to 12.0%/);
});

test("the rate stands alone when its count has nothing to say", () => {
  // Churn moved because the client base grew, not because anybody left:
  // clients who left is unchanged, so it produces no sentence and there is
  // nothing for churn to duplicate.
  const { wins } = highlights([
    {
      ...base,
      key: "client_experience_clients_who_left",
      label: "Clients who left",
      goodDirection: "down",
      value: 2,
      previous: 2,
    },
    {
      ...base,
      key: "client_experience_churn_rate",
      label: "Churn rate",
      unit: "percent",
      goodDirection: "down",
      value: 4,
      previous: 8,
    },
  ]);

  assert.equal(wins.length, 1);
  assert.match(wins[0].text, /^Churn rate down 4.0%/);
});

test("every pulled pair names a different metric, and never itself", () => {
  // The metric list is what proves these are real and really pulled —
  // that check lives in the schema test, which can see it. What can be
  // checked here is the shape.
  for (const [copy, source] of Object.entries(PULLED_FROM)) {
    assert.notEqual(copy, source);
    assert.equal(
      PULLED_FROM[source],
      undefined,
      `${source} is itself a copy — a chain would need the rule to be transitive`,
    );
  }
});

test("every derived metric names a real base, and never itself", () => {
  // A typo in the map is a sentence that silently never appears. There is
  // no metric list in this module to check against, so what can be checked
  // here is the shape: distinct keys, same category, no chains.
  for (const [derived, root] of Object.entries(DERIVED_FROM)) {
    assert.notEqual(derived, root);
    assert.equal(
      DERIVED_FROM[root],
      undefined,
      `${root} is itself derived — a chain would need the rule to be transitive`,
    );
    assert.equal(
      derived.split("_")[0],
      root.split("_")[0],
      `${derived} and ${root} should be in the same category`,
    );
  }
});

test("a figure pulled from another place is not reported twice", () => {
  // Dom's bug, 8 October: "Total revenue from offers" and "Revenue from
  // offers" both in "What went WELL", both £2,000 to £3,000. One figure,
  // two places — Financials shows the Offers total — and the label dedupe
  // missed it because the two labels are different strings.
  const { wins } = highlights([
    {
      ...base,
      key: "offers_total_revenue_from_offers",
      label: "Total revenue from offers",
      unit: "currency",
      value: 3000,
      previous: 2000,
    },
    {
      ...base,
      key: "financials_revenue_from_offers",
      label: "Revenue from offers",
      unit: "currency",
      value: 3000,
      previous: 2000,
    },
  ]);

  assert.equal(wins.length, 1, "the source says it; the copy does not say it again");
  assert.match(wins[0].text, /^Total revenue from offers/);
});

test("and it stays suppressed even if the two land in different panels", () => {
  // The difference from DERIVED_FROM, and the reason this is its own map.
  // A rate and its count can tell different stories, so that rule keys on
  // the panel. A pulled figure is the SAME NUMBER, so there is no reading
  // in which saying it twice is right — and nothing should depend on the
  // two happening to agree about direction.
  const { wins, attention } = highlights([
    {
      ...base,
      key: "leads_conversions_new_clients",
      label: "New clients",
      value: 8,
      previous: 4,
    },
    {
      ...base,
      key: "client_experience_new_clients",
      label: "Clients gained",
      goodDirection: "down",
      value: 8,
      previous: 4,
    },
  ]);

  assert.equal(wins.length, 1);
  assert.equal(attention.length, 0, "the copy is gone, whichever panel it wanted");
});

test("a pulled figure stands alone when its source says nothing", () => {
  // Financials moved and Offers did not — which cannot happen while one
  // is the sum of the other, but the rule should not depend on that.
  const { wins } = highlights([
    {
      ...base,
      key: "offers_total_revenue_from_offers",
      label: "Total revenue from offers",
      unit: "currency",
      value: 3000,
      previous: 3000,
    },
    {
      ...base,
      key: "financials_revenue_from_offers",
      label: "Revenue from offers",
      unit: "currency",
      value: 3000,
      previous: 2000,
    },
  ]);

  assert.equal(wins.length, 1);
  assert.match(wins[0].text, /^Revenue from offers/);
});

/**
 * Nina, 28 October: the tails come off the lines going the wrong way and a
 * "Focus area" tag carries the signal instead.
 *
 * Asserted as the absence of a tail rather than as four exact strings,
 * because the four exact strings are asserted above and this is the rule
 * they have to keep: nothing in the attention panel tells the reader how
 * to feel about it. The celebration lines are checked for the opposite —
 * they are hers and they stay.
 */
test("no attention line carries a tail, and the wins keep theirs", () => {
  assert.equal(FOCUS_TAG, "Focus area");

  const attention = [
    TEMPLATES.countDown,
    TEMPLATES.rateDown,
    TEMPLATES.belowTarget,
    TEMPLATES.badRise,
  ];

  for (const template of attention) {
    assert.doesNotMatch(template, /WHY|YET|worth a proper look|direction we want|👀/, template);
    // A plain statement: no trailing dash or ellipsis left behind by the cut.
    assert.doesNotMatch(template, /[-–—.…]\s*$/, template);
  }

  // Untouched, and deliberately: she asked about the repeated tail, not
  // about her own celebrations.
  assert.match(TEMPLATES.countUp, /stunning$/);
  assert.match(TEMPLATES.rateUp, /no accident$/);
  assert.match(TEMPLATES.beatTarget, /WOOOO$/);
  assert.match(TEMPLATES.goodFall, /exactly the direction we want$/);
});

/** Every sentence that reaches the attention panel is one of the four. */
test("the attention panel only ever draws a stripped template", () => {
  const { attention } = highlights([
    {
      key: "leads_conversions_new_clients",
      label: "New clients",
      unit: "count",
      goodDirection: "up",
      value: 4,
      previous: 9,
      currency: "GBP",
    },
    {
      key: "client_experience_churn_rate",
      label: "Churn rate",
      unit: "percent",
      goodDirection: "down",
      value: 9,
      previous: 4,
      currency: "GBP",
    },
  ]);

  assert.equal(attention.length, 2);
  for (const item of attention) {
    assert.doesNotMatch(item.text, /WHY|YET|worth a proper look|direction we want|👀/, item.text);
  }
});

/**
 * The floors under both panels (Dom, 1 November).
 *
 * The case that asked for them is first, and it is a real screenshot
 * rather than an invented number: variable costs £239 → £250, which
 * reached "Look at these first" beside new clients at a fifth of
 * target and a list that had shrunk.
 */
test("£11 on £239 is a move, not news", () => {
  assert.equal(
    highlightFor({
      ...base,
      label: "Variable costs",
      unit: "currency",
      goodDirection: "down",
      value: 250,
      previous: 239,
    }),
    null,
    "4.6% of last month, under the 10% floor",
  );

  // The same figure moved properly still speaks, so what was built is a
  // floor and not an off switch.
  assert.equal(
    highlightFor({
      ...base,
      label: "Variable costs",
      unit: "currency",
      goodDirection: "down",
      value: 320,
      previous: 239,
    })?.text,
    "Variable costs up £81",
  );
});

test("the Overview that prompted it now shows two focus areas, not three", () => {
  // The three lines on that screenshot, as the panel had them.
  const { attention } = highlights([
    {
      ...base,
      key: "leads_conversions_new_clients",
      label: "New clients",
      value: 1,
      previous: 1,
      target: 5,
    },
    {
      ...base,
      key: "email_list_size_at_month_end",
      label: "List size at month end",
      value: 870,
      previous: 870,
      target: 1000,
    },
    {
      ...base,
      key: "financials_variable_costs",
      label: "Variable costs",
      unit: "currency",
      goodDirection: "down",
      value: 250,
      previous: 239,
    },
  ]);

  assert.equal(attention.length, 2);
  assert.ok(
    !attention.some((h) => h.text.includes("Variable costs")),
    `the £11 is gone, got ${JSON.stringify(attention.map((h) => h.text))}`,
  );
  // And the two real ones are untouched, in the order they were in.
  assert.equal(attention[0].text, "New clients is at 20% of your target");
  assert.equal(attention[1].text, "List size at month end is at 87% of your target");
});

test("one of three clients still speaks, in both directions", () => {
  // **The reason the amount floor cannot stand alone.** One client is
  // the smallest move a count can make and 3 → 2 is a third of the
  // book: the single most important number on the page, and no floor
  // may silence it.
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 2, previous: 3 })?.text,
    "1 fewer new client than last month",
  );
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 3, previous: 2 })?.text,
    "1 MORE new client than last month - stunning",
  );

  // Ten clients becoming nine is the same one client and a tenth of
  // the book — exactly on the floor, and in.
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 9, previous: 10 })?.text,
    "1 fewer new client than last month",
  );
  // Eleven becoming ten is not.
  assert.equal(highlightFor({ ...base, label: "New clients", value: 10, previous: 11 }), null);
});

test("a target missed by less than 5% is not a job", () => {
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 97, target: 100 }),
    null,
    "97% of target: nearly did the thing",
  );
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 94, target: 100 })?.text,
    "New clients is at 94% of your target",
  );

  // The same rule from the other side, where overshooting is the miss.
  assert.equal(
    highlightFor({
      ...base,
      label: "Cost per lead",
      unit: "currency",
      goodDirection: "down",
      value: 5.1,
      target: 5,
    }),
    null,
    "2% over a cost target",
  );
  assert.equal(
    highlightFor({
      ...base,
      label: "Cost per lead",
      unit: "currency",
      goodDirection: "down",
      value: 6,
      target: 5,
    })?.text,
    "Cost per lead is at 120% of your target",
  );

  // And the win side keeps its own, narrower threshold, on purpose.
  assert.equal(FOCUS_FLOORS.targetBeatPct, 1);
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 102, target: 100 })?.text,
    "New clients beat your target by 2% WOOOO",
  );
});

test("money is judged at the size the money is", () => {
  // 14p to 20p is six pence and nearly half again: the most important
  // thing on an Ads tab, and £100 would have silenced it.
  assert.equal(
    highlightFor({
      ...base,
      label: "Cost per click",
      unit: "currency",
      goodDirection: "down",
      value: 0.2,
      previous: 0.14,
    })?.text,
    // The move, in pennies, as the Ads card prints it.
    "Cost per click up £0.06",
  );

  // £50 on £24,650 is the same arithmetic the other way up.
  assert.equal(
    highlightFor({
      ...base,
      label: "Total revenue",
      unit: "currency",
      value: 24700,
      previous: 24650,
    }),
    null,
  );

  assert.equal(floorFor("currency", 0.14), 0.05);
  assert.equal(floorFor("currency", 239), 1);
  assert.equal(floorFor("currency", 24650), 100);
  // **Judged at the larger of the two months**, which is the one place
  // that choice shows: £950 → £1,049 is 10.4% and £99 — over the share
  // floor, under the £100 a figure of that size owes. Tiered on the
  // smaller month it would owe £1 and speak.
  assert.ok(!clearsFloors("currency", 1049, 950));
  assert.ok(clearsFloors("currency", 1060, 950));
});

test("the amount floor does the work the share cannot", () => {
  // Doubling two hours of admin reclaimed is 100% of nothing much.
  assert.ok(!clearsFloors("hours", 2.5, 1));
  assert.ok(clearsFloors("hours", 3, 1));
  // A rate that moved half a point, however small it started.
  assert.ok(!clearsFloors("percent", 1.4, 0.9));
  assert.ok(clearsFloors("percent", 2.1, 0.9));
});

test("a figure arriving from zero is read as what it is", () => {
  // No share to take, so the amount is the whole test — and two new
  // clients from none is two clients, not 200% of nothing.
  assert.equal(
    highlightFor({ ...base, label: "New clients", value: 2, previous: 0 })?.text,
    "2 MORE new clients than last month - stunning",
  );
  // The amount floor is still the whole test from zero: 2p appearing on
  // a figure that lives in pennies is not an event.
  assert.ok(!clearsFloors("currency", 0.02, 0));
  assert.ok(clearsFloors("currency", 0.4, 0));
});

test("the floors are five numbers, and they are in the map", () => {
  // Asserted like the wording above and for the same reason: they are
  // Nina's to change, they are written up for her in
  // docs/nina-review/04-wording.md §7, and a change here should be a
  // change there rather than a surprise on a screen.
  assert.equal(FOCUS_FLOORS.relativePct, 10);
  assert.equal(FOCUS_FLOORS.targetMissPct, 5);
  assert.deepEqual(FOCUS_FLOORS.absolute, {
    count: 1,
    percent: 1,
    hours: 2,
    ratio: 0.1,
    months: 0.5,
    text: 0,
  });
  assert.deepEqual(FOCUS_FLOORS.currency, [
    { upTo: 10, floor: 0.05 },
    { upTo: 1000, floor: 1 },
    { upTo: Infinity, floor: 100 },
  ]);
});
