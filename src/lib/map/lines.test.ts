import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAP_LINES,
  bendFor,
  lineColourFor,
  spokePath,
  strokeColourFor,
} from "./lines.ts";
import { ARTWORKS, LANDSCAPE } from "./positions.ts";

// Line membership is the same on both pictures; the coordinates are not.
const STATION_POSITIONS = LANDSCAPE.stations;
const PIAZZA_HUB = LANDSCAPE.hub;

test("every station is on exactly one line", () => {
  for (const slug of Object.keys(STATION_POSITIONS)) {
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

test("lineColourFor finds a colour for every placed station", () => {
  for (const slug of Object.keys(STATION_POSITIONS)) {
    assert.ok(lineColourFor(slug), `${slug} has no colour`);
  }
  assert.equal(lineColourFor("not-a-station"), null);
});

// Piazza is the daily homepage and everything is reached from it, so a spoke
// that started anywhere else would be drawing a different product.
test("every spoke starts at the hub", () => {
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    const path = spokePath(pos, 0);
    assert.ok(
      path.startsWith(`M ${PIAZZA_HUB.x} ${PIAZZA_HUB.y}`),
      `${slug}'s spoke doesn't leave the fountain`,
    );
    assert.ok(path.endsWith(`${pos.x} ${pos.y}`), `${slug}'s spoke doesn't arrive`);
  }
});

test("a bend curves the spoke without moving either end", () => {
  const station = STATION_POSITIONS["terrazza"];
  const straight = spokePath(station, 0);
  const bent = spokePath(station, 1);

  assert.notEqual(straight, bent, "the bend did nothing");
  assert.ok(bent.startsWith(`M ${PIAZZA_HUB.x} ${PIAZZA_HUB.y}`));
  assert.ok(bent.endsWith(`${station.x} ${station.y}`));
});

test("opposite bends curve to opposite sides", () => {
  const station = STATION_POSITIONS["terrazza"];
  const control = (path: string) => path.split("Q ")[1].split(" ").slice(0, 2).map(Number);

  const [leftX, leftY] = control(spokePath(station, -1));
  const [rightX, rightY] = control(spokePath(station, 1));
  const [midX, midY] = control(spokePath(station, 0));

  // The two bent control points should sit either side of the unbent one.
  assert.ok((leftX - midX) * (rightX - midX) < 0 || (leftY - midY) * (rightY - midY) < 0);
});

// Four gold spokes leaving the hub in similar directions would otherwise stack.
test("spokes on a line fan out rather than stacking", () => {
  const bends = [0, 1, 2, 3].map((i) => bendFor(i, 4));
  assert.deepEqual(new Set(bends).size, 4, "two spokes share a bend");
  // Symmetric about the middle, so the fan is centred on the straight line.
  assert.equal(bends[0], -bends[3]);
  assert.equal(bends[1], -bends[2]);
});

test("a line with one station gets no bend — nothing to fan away from", () => {
  assert.equal(bendFor(0, 1), 0);
});

for (const artwork of ARTWORKS) {
  test(`[${artwork.key}] every spoke starts at that picture's hub`, () => {
    for (const [slug, pos] of Object.entries(artwork.stations)) {
      const path = spokePath(pos, 0, artwork.hub);
      assert.ok(path.startsWith(`M ${artwork.hub.x} ${artwork.hub.y}`), `${slug}'s spoke doesn't leave the fountain`);
    }
  });
}

// Your Story ran its own dashed route along the shore on the first two
// pictures. On the third (19 Sep) its two stations sit on the same side of
// the town above the harbour, and Dom chose plain spokes for them.
test("Your Story is a plain pair of spokes, drawn in its own navy", () => {
  const story = MAP_LINES.find((l) => l.key === "your_story")!;
  assert.deepEqual(story.stations, ["grand-hotel-riposo", "archivio"]);
  assert.equal(strokeColourFor(story), "var(--aos-navy)");
});

test("every line is drawn in its own colour", () => {
  for (const line of MAP_LINES) {
    assert.equal(strokeColourFor(line), line.colour, `${line.key} draws off-colour`);
  }
});
