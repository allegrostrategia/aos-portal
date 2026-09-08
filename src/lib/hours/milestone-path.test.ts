import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARTWORK_SHA256,
  MILESTONE_POINTS,
  ROAD_MASK,
  ROAD_MASK_CELL,
  ROAD_PATH,
  isOnRoad,
} from "./milestone-path.ts";
import { MILESTONES } from "./milestones.ts";

/**
 * The traced road is actually on the road.
 *
 * Same reasoning as La Strada's sea test, and the same lesson behind it: these
 * coordinates are checked by a person looking at a picture, and nothing else was
 * checking them. Here the numbers are generated rather than hand-placed, so the
 * failure this guards against is different — not a typo, but a regenerated trace
 * that quietly latches onto a rooftop, or an artwork swap that leaves the road
 * somewhere else entirely.
 */

const ARTWORK_W = 941;
const ARTWORK_H = 1672;
/** The marker is 11cqw across; two closer than that would overlap. */
const MARKER_WIDTH = 11;

/** Distance in percent-of-width, so x and y are comparable on a tall picture. */
function apart(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) * (ARTWORK_H / ARTWORK_W));
}

/** How far a point is from the nearest road cell, in mask cells. */
function cellsFromRoad(p: { x: number; y: number }): number {
  const row = (p.y / 100) * ARTWORK_H / ROAD_MASK_CELL;
  const col = (p.x / 100) * ARTWORK_W / ROAD_MASK_CELL;
  let best = Infinity;
  ROAD_MASK.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch !== "#") return;
      best = Math.min(best, Math.hypot(r - row, c - col));
    });
  });
  return best;
}

test("the trace still describes the artwork it was taken from", () => {
  const art = fileURLToPath(
    new URL("../../../public/illustrations/milestone-path.png", import.meta.url),
  );
  const actual = createHash("sha256").update(readFileSync(art)).digest("hex");

  assert.equal(
    actual,
    ARTWORK_SHA256,
    "milestone-path.png has changed since the road was traced, so the path and " +
      "every marker on it are drawn against a road that has moved. Run " +
      "`node scripts/build-milestone-path.mjs` and look at the picture again.",
  );
});

test("there is a marker for every milestone, in order", () => {
  assert.deepEqual(
    MILESTONE_POINTS.map((p) => p.hours),
    [...MILESTONES],
  );
});

test("every milestone marker is on the road", () => {
  for (const point of MILESTONE_POINTS) {
    assert.ok(
      isOnRoad(point.x, point.y),
      `the ${point.hours} hrs marker is off the road at (${point.x}, ${point.y})`,
    );
  }
});

test("no two markers overlap", () => {
  for (let i = 0; i < MILESTONE_POINTS.length; i++) {
    for (let j = i + 1; j < MILESTONE_POINTS.length; j++) {
      const gap = apart(MILESTONE_POINTS[i], MILESTONE_POINTS[j]);
      assert.ok(
        gap > MARKER_WIDTH,
        `${MILESTONE_POINTS[i].hours} and ${MILESTONE_POINTS[j].hours} are ${gap.toFixed(1)} apart`,
      );
    }
  }
});

test("the markers run down the picture in ascending order", () => {
  // The brief: zero at the top, 750 at the bottom, so a member sees where they
  // are on load and scrolls toward what is ahead. A marker out of order would
  // mean the trace was walked from the wrong end.
  const ys = MILESTONE_POINTS.map((p) => p.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test("the path starts at the top and ends at the bottom", () => {
  assert.ok(ROAD_PATH[0].y < 10, `the path starts at ${ROAD_PATH[0].y}%, not the top`);
  const last = ROAD_PATH[ROAD_PATH.length - 1];
  assert.ok(last.y > 90, `the path ends at ${last.y}%, not the bottom`);
});

test("the path runs downhill, allowing for the hairpins", () => {
  // This road doubles back on itself, so a few steps rise slightly. What must
  // not happen is a jump backwards, which would mean the ordering is wrong.
  for (let i = 1; i < ROAD_PATH.length; i++) {
    const rise = ROAD_PATH[i - 1].y - ROAD_PATH[i].y;
    assert.ok(rise < 2, `the path jumps back up ${rise.toFixed(1)}% at point ${i}`);
  }
});

test("the path stays on the road", () => {
  // Not every point sits inside the mask, and that is expected rather than
  // sloppy: the road is broken by tree canopy in two places, and the trace
  // bridges those gaps. The points that miss cluster on the bridges, where
  // there is no visible road to be on. What matters is that none of them
  // wanders off toward a rooftop.
  const off = ROAD_PATH.filter((p) => !isOnRoad(p.x, p.y));
  assert.ok(
    off.length < ROAD_PATH.length * 0.25,
    `${off.length} of ${ROAD_PATH.length} path points are off the road`,
  );

  for (const point of off) {
    const cells = cellsFromRoad(point);
    assert.ok(
      cells < 3,
      `the path is ${(cells * ROAD_MASK_CELL).toFixed(0)}px from the road at (${point.x}, ${point.y})`,
    );
  }
});
