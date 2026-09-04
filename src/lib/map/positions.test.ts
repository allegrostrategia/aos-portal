import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PIAZZA_HUB,
  PIAZZA_SOCIALE,
  STATION_POSITIONS,
  YOUR_STORY_WAYPOINTS,
  mapDistance,
  unplacedStations,
} from "./positions.ts";

// The eleven from the reference data migration.
const STATIONS = [
  "grand-hotel-riposo",
  "studio-dell-architetto",
  "officina-vespa",
  "cinema-allegro",
  "piazza-caffe",
  "la-boutique",
  "banco-allegro",
  "stazione-centrale",
  "terrazza",
  "club-allegro",
  "archivio",
];

test("every station has a position — an unplaced one would be invisible", () => {
  assert.deepEqual(unplacedStations(STATIONS), []);
});

test("no positions for stations that don't exist", () => {
  const extra = Object.keys(STATION_POSITIONS).filter((s) => !STATIONS.includes(s));
  assert.deepEqual(extra, []);
});

test("every marker sits inside the image", () => {
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    assert.ok(pos.x > 5 && pos.x < 95, `${slug} x is off the edge`);
    assert.ok(pos.y > 5 && pos.y < 95, `${slug} y is off the edge`);
  }
});

test("no two stations sit on top of each other", () => {
  // Markers are about 9% of the width; anything closer overlaps and becomes
  // untappable on a phone. Measured with `mapDistance`, because 10% down is not
  // the same distance as 10% across on a 16:9 image and a plain hypotenuse
  // would call a vertical near-miss safe.
  const entries = Object.entries(STATION_POSITIONS);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aSlug, a] = entries[i];
      const [bSlug, b] = entries[j];
      const distance = mapDistance(a, b);
      assert.ok(distance > 9, `${aSlug} and ${bSlug} are ${distance.toFixed(1)} apart`);
    }
  }
});

test("nothing is dropped on the hub or the Piazza Sociale label", () => {
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    assert.ok(mapDistance(pos, PIAZZA_HUB) > 9, `${slug} overlaps the hub`);
    assert.ok(mapDistance(pos, PIAZZA_SOCIALE) > 9, `${slug} overlaps Piazza Sociale`);
  }
  assert.ok(mapDistance(PIAZZA_HUB, PIAZZA_SOCIALE) > 9, "the two labels collide");
});

// The line runs harbour → bends → Archivio along the bottom. If a bend drifts
// up into the town the line stops following the road it was drawn on.
test("the Your Story bends stay below both its stations", () => {
  const from = STATION_POSITIONS["grand-hotel-riposo"];
  const to = STATION_POSITIONS["archivio"];

  for (const bend of YOUR_STORY_WAYPOINTS) {
    assert.ok(bend.y > from.y && bend.y > to.y, "a bend rose into the town");
    assert.ok(bend.x > from.x && bend.x < to.x, "a bend sits beyond a station");
  }
});

test("the bends run in order, so the line doesn't double back", () => {
  const xs = YOUR_STORY_WAYPOINTS.map((p) => p.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});

// §-nothing, but the artwork is 16:9 and a phone crops it hard. Anything out at
// the extremes is the first thing to be lost.
test("every station survives a centre crop to 4:3", () => {
  // A 4:3 window on a 16:9 image keeps the middle 75% of the width.
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    assert.ok(pos.x > 8 && pos.x < 92, `${slug} is too near the side to survive a crop`);
  }
});

test("the open piazza in the middle is left clear", () => {
  // The square and its fountain are the picture's centre — and Piazza is the
  // homepage, not a station, so nothing should be dropped on top of it.
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    const inSquare = pos.x > 40 && pos.x < 64 && pos.y > 25 && pos.y < 70;
    assert.ok(!inSquare, `${slug} is sitting in the middle of the piazza`);
  }
});
