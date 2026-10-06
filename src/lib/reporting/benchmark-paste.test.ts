import assert from "node:assert/strict";
import { test } from "node:test";

import { readBenchmarkReply, type BenchmarkMetric } from "./benchmark-paste.ts";

/**
 * Reading a pasted benchmark reply.
 *
 * The rule under all of these: **a number nobody said is worse than no
 * number**, because a traffic light gets drawn from it. So anything the
 * parser is not sure about comes back as unmatched and is shown to the
 * person who pasted it.
 */

const METRICS: BenchmarkMetric[] = [
  { key: "funnels_opt_in_rate", label: "Opt-in rate", unit: "percent" },
  { key: "email_open_rate", label: "Open rate", unit: "percent" },
  { key: "ads_cost_per_lead", label: "Cost per lead", unit: "currency" },
  { key: "social_media_engagement_rate", label: "Engagement rate", unit: "percent" },
];

test("an ordinary reply is read line by line", () => {
  const result = readBenchmarkReply(
    `Opt-in rate: 35%
     Open rate: 42%
     Cost per lead: £4.50`,
    METRICS,
  );

  assert.deepEqual(
    result.matched.map((m) => [m.key, m.value]),
    [
      ["funnels_opt_in_rate", 35],
      ["email_open_rate", 42],
      ["ads_cost_per_lead", 4.5],
    ],
  );
  assert.deepEqual(result.unmatched, []);
});

test("a little politeness is allowed; a sentence is not", () => {
  assert.deepEqual(
    readBenchmarkReply("The Opt-in rate: 32%", METRICS).matched,
    [{ key: "funnels_opt_in_rate", label: "Opt-in rate", value: 32 }],
  );

  // A whole sentence is handed back rather than mined for a number.
  // The line is shown, so retyping it costs seconds; a wrong benchmark
  // behind a traffic light costs more.
  const prose = readBenchmarkReply(
    "For coaching businesses the typical Opt-in rate is around 32 per cent.",
    METRICS,
  );
  assert.deepEqual(prose.matched, []);
  assert.equal(prose.unmatched.length, 1);
});

test("a label is not matched by a line that merely contains it", () => {
  // "Webinar show-up rate" is not "Show-up rate", and reading it as one
  // put an answer nobody gave behind a traffic light.
  const metrics = [{ key: "launches_show_up_rate", label: "Show-up rate", unit: "percent" }];
  const result = readBenchmarkReply("Webinar show-up rate: 48%", metrics);

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, ["Webinar show-up rate: 48%"]);
});

test("a range is not a benchmark", () => {
  // "Between 30 and 40%" is two numbers and a judgement. Picking one
  // would be aOS working a benchmark out, which §7 forbids.
  const result = readBenchmarkReply("Opt-in rate: between 30 and 40%", METRICS);
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, ["Opt-in rate: between 30 and 40%"]);
});

test("a line naming no metric we know comes back", () => {
  const result = readBenchmarkReply(
    `Opt-in rate: 35%
     Webinar show-up rate: 48%`,
    METRICS,
  );
  assert.equal(result.matched.length, 1);
  assert.deepEqual(result.unmatched, ["Webinar show-up rate: 48%"]);
});

test("a metric with no number comes back", () => {
  const result = readBenchmarkReply("Cost per lead: varies a lot by niche", METRICS);
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, ["Cost per lead: varies a lot by niche"]);
});

test("the same metric twice keeps the first and hands back the second", () => {
  const result = readBenchmarkReply(
    `Opt-in rate: 35%
     Opt-in rate: 40%`,
    METRICS,
  );
  assert.deepEqual(result.matched, [
    { key: "funnels_opt_in_rate", label: "Opt-in rate", value: 35 },
  ]);
  assert.deepEqual(result.unmatched, ["Opt-in rate: 40%"]);
});

test("blank lines are not unmatched lines", () => {
  const result = readBenchmarkReply("\n\nOpt-in rate: 35%\n\n", METRICS);
  assert.equal(result.matched.length, 1);
  assert.deepEqual(result.unmatched, []);
});

test("nothing is invented for a metric the reply never mentions", () => {
  const result = readBenchmarkReply("Opt-in rate: 35%", METRICS);
  assert.equal(result.matched.length, 1);
  assert.ok(
    !result.matched.some((m) => m.key === "social_media_engagement_rate"),
    "a metric nobody answered has no benchmark",
  );
});

test("case and punctuation do not matter; the words do", () => {
  const result = readBenchmarkReply("COST PER LEAD — £4.50", METRICS);
  assert.deepEqual(result.matched, [
    { key: "ads_cost_per_lead", label: "Cost per lead", value: 4.5 },
  ]);
});
