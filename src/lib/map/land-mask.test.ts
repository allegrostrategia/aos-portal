import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ARTWORK_SHA256, isSea, seaFraction } from "./land-mask.ts";
import {
  PIAZZA_HUB,
  PIAZZA_SOCIALE,
  STATION_POSITIONS,
  YOUR_STORY_WAYPOINTS,
} from "./positions.ts";

/**
 * Nothing on the map is placed in the sea.
 *
 * Added 7 Sep, after Grand Hotel Riposo spent several days sitting in the
 * middle of the marina. Every other map test passed throughout: they check
 * separation, bounds, ordering and crop survival, which are all properties of
 * the *numbers*. None of them had any idea what the numbers were pointing at.
 * That is the gap this closes — a position can be structurally perfect and
 * still be in the water, and the only thing that had ever noticed was Dom
 * looking at the screen.
 *
 * It found a second one immediately: the first Your Story bend was off the end
 * of the jetty, and each bend draws a visible dot.
 *
 * The ground truth is `land-mask.ts`, generated from the artwork. Read the
 * generator before changing the thresholds here — in particular, this test
 * cannot be rewritten as "sample the pixels and look for blue". That was tried
 * and it does not work on this picture.
 */

/** The marker tile from `la-strada-map.tsx`: 8.8cqw wide, 8:7. */
const MARKER_W = 8.8;
/** …in y units, which are percent of *height*, hence the 16:9 conversion. */
const MARKER_H = ((8.8 * 7) / 8) * (16 / 9);

test("the mask still describes the artwork it was built from", () => {
  const art = fileURLToPath(
    new URL("../../../public/illustrations/la-strada-map.png", import.meta.url),
  );
  const actual = createHash("sha256").update(readFileSync(art)).digest("hex");

  assert.equal(
    actual,
    ARTWORK_SHA256,
    "la-strada-map.png has changed since the land mask was generated, so every " +
      "position below is being checked against a coastline that has moved. " +
      "Run `node scripts/build-map-mask.mjs` and look at the map again.",
  );
});

test("no station marker is anchored in the sea", () => {
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    assert.ok(!isSea(pos.x, pos.y), `${slug} is in the water at (${pos.x}, ${pos.y})`);
  }
});

test("no station marker is mostly sea", () => {
  // A marker can legitimately overhang the coast — the town is on a headland and
  // several stations sit right above the water. What it cannot do is float.
  // Grand Hotel Riposo is the worst legitimate case at 36%, because the harbour
  // wraps around below it; the bug this test was written for scored 76%.
  for (const [slug, pos] of Object.entries(STATION_POSITIONS)) {
    const wet = seaFraction(pos.x, pos.y, MARKER_W, MARKER_H);
    assert.ok(
      wet < 0.6,
      `${slug} is ${(wet * 100).toFixed(0)}% sea — it is sitting on the water, not the town`,
    );
  }
});

test("the two place labels are on land", () => {
  // Not stations, but they are drawn on the picture and read the same way.
  assert.ok(!isSea(PIAZZA_HUB.x, PIAZZA_HUB.y), "the Piazza label is in the sea");
  assert.ok(!isSea(PIAZZA_SOCIALE.x, PIAZZA_SOCIALE.y), "Piazza Sociale is in the sea");
});

test("the Your Story bends are on land", () => {
  // Each bend draws a visible dot — the "Your Story Stations" in the legend —
  // so a bend in the water is a marker in the water. This is what caught the
  // first one.
  for (const [i, bend] of YOUR_STORY_WAYPOINTS.entries()) {
    assert.ok(!isSea(bend.x, bend.y), `bend ${i + 1} is in the water at (${bend.x}, ${bend.y})`);
  }
});
