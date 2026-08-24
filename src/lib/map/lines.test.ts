import assert from "node:assert/strict";
import { test } from "node:test";

import { MAP_LINES, lineColourFor, segmentPath } from "./lines.ts";
import { STATION_POSITIONS } from "./positions.ts";

test("every station is on exactly one line", () => {
  const slugs = Object.keys(STATION_POSITIONS);
  for (const slug of slugs) {
    const lines = MAP_LINES.filter((l) => l.stations.includes(slug));
    assert.equal(lines.length, 1, `${slug} is on ${lines.length} lines`);
  }
});

test("no line names a station that isn't on the map", () => {
  for (const line of MAP_LINES) {
    for (const slug of line.stations) {
      assert.ok(slug in STATION_POSITIONS, `${line.key} names unknown ${slug}`);
    }
  }
});

test("a line is only drawn when there's more than one station on it", () => {
  for (const line of MAP_LINES) {
    if (line.drawLine) {
      assert.ok(line.stations.length > 1, `${line.key} draws a line to nowhere`);
    }
  }
});

test("lineColourFor finds a colour for every placed station", () => {
  for (const slug of Object.keys(STATION_POSITIONS)) {
    assert.ok(lineColourFor(slug), `${slug} has no colour`);
  }
  assert.equal(lineColourFor("not-a-station"), null);
});

test("segments bow away from the middle rather than crossing it", () => {
  // The Profit line runs from the left of the square to the right, so its
  // straight path would go over the fountain. The curve should not.
  const from = STATION_POSITIONS["piazza-caffe"];
  const to = STATION_POSITIONS["banco-allegro"];
  const path = segmentPath(from, to);

  const control = path.match(/Q ([\d.-]+) ([\d.-]+)/);
  assert.ok(control, "expected a quadratic control point");

  const straightMid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const straightDistance = Math.hypot(straightMid.x - 50, straightMid.y - 50);
  const bowedDistance = Math.hypot(Number(control[1]) - 50, Number(control[2]) - 50);

  assert.ok(
    bowedDistance > straightDistance,
    "the curve should sit further from the centre than the straight line",
  );
});

test("a segment whose midpoint is dead centre still produces a path", () => {
  const path = segmentPath({ x: 40, y: 50 }, { x: 60, y: 50 });
  assert.ok(path.startsWith("M 40 50 Q"), path);
  assert.ok(!path.includes("NaN"), "no division by zero");
});
