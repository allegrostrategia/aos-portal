import assert from "node:assert/strict";
import { test } from "node:test";

import { STATION_POSITIONS, unplacedStations } from "./positions.ts";

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
  // Markers are about 8% wide at rest; anything closer than that overlaps and
  // becomes untappable on a phone.
  const entries = Object.entries(STATION_POSITIONS);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aSlug, a] = entries[i];
      const [bSlug, b] = entries[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(distance > 8, `${aSlug} and ${bSlug} are ${distance.toFixed(1)}% apart`);
    }
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
