import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAP_LINES,
  bendFor,
  lineColourFor,
  spokePath,
  storyPath,
  strokeColourFor,
  yourStoryPoints,
} from "./lines.ts";
import { PIAZZA_HUB, STATION_POSITIONS } from "./positions.ts";

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

// Overruled 4 Sep: an earlier version drew nothing here, and the absence read
// as an omission rather than a decision.
test("Your Story has a route, through its waypoints", () => {
  const points = yourStoryPoints();
  assert.equal(points.length, 4, "harbour, two bends, Archivio");
  assert.deepEqual(points[0], STATION_POSITIONS["grand-hotel-riposo"]);
  assert.deepEqual(points[3], STATION_POSITIONS["archivio"]);

  const path = storyPath(points);
  assert.ok(path.startsWith("M "), "it should be a path");
  assert.equal((path.match(/T /g) ?? []).length, 2, "the later bends continue smoothly");
});

test("the story line is drawn pale, while its badges stay navy", () => {
  const story = MAP_LINES.find((l) => l.ownRoute)!;
  assert.equal(story.colour, "var(--aos-navy)");
  assert.notEqual(strokeColourFor(story), story.colour);
});

test("every other line is drawn in its own colour", () => {
  for (const line of MAP_LINES.filter((l) => !l.ownRoute)) {
    assert.equal(strokeColourFor(line), line.colour, `${line.key} draws off-colour`);
  }
});

test("only one line has its own route", () => {
  assert.equal(MAP_LINES.filter((l) => l.ownRoute).length, 1);
});

test("a path needs at least two points", () => {
  assert.equal(storyPath([]), "");
  assert.equal(storyPath([{ x: 1, y: 1 }]), "");
});
