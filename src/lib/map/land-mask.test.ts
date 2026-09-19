import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isSea, seaFraction } from "./land-mask.ts";
import { DOT, HALO, typicalWidth } from "./markers.ts";
import { ARTWORKS } from "./positions.ts";

/**
 * Nothing on the map is placed in the sea, on either picture.
 *
 * Added 7 Sep, after Grand Hotel Riposo spent several days sitting in the
 * middle of the marina. Every other map test passed throughout: they check
 * separation, bounds, ordering and crop survival, which are all properties of
 * the *numbers*. None of them had any idea what the numbers were pointing at.
 * That is the gap this closes: a position can be structurally perfect and
 * still be in the water, and the only thing that had ever noticed was Dom
 * looking at the screen. It found a second one immediately.
 *
 * The ground truth is a mask per picture, generated from that picture
 * (scripts/build-map-mask.mjs). Read the generator before changing the
 * thresholds here; in particular, this cannot be rewritten as "sample the
 * pixels and look for blue". That was tried and it does not work.
 */

for (const artwork of ARTWORKS) {
  const { key, mask, stations } = artwork;
  // The dot and its halo in percent of the picture, at its typical width:
  // the patch of picture a marker actually covers. (It was a photo tile,
  // 8.8% of the width; a dot is smaller, so this is a stricter check on the
  // anchor and a looser one on the surroundings.)
  const width = typicalWidth(artwork);
  const patch = DOT + HALO * 2;
  const TILE_W = (patch / width) * 100;
  const TILE_H = (patch / (width * (artwork.height / artwork.width))) * 100;

  test(`[${key}] the mask still describes the artwork it was built from`, () => {
    const file = readFileSync(fileURLToPath(new URL(`../../../public/illustrations/${artwork.file}`, import.meta.url)));
    const hash = createHash("sha256").update(file).digest("hex");
    assert.equal(
      hash,
      mask.sha256,
      `${artwork.file} has changed since its land mask was generated, so every position check against it is meaningless. Run: node scripts/build-map-mask.mjs ${key}`,
    );
    assert.equal(mask.file, artwork.file);
  });

  test(`[${key}] the mask's grid matches the picture`, () => {
    assert.equal(mask.rows.length, Math.ceil(mask.height / mask.cell));
    for (const row of mask.rows) assert.equal(row.length, Math.ceil(mask.width / mask.cell));
    assert.equal(mask.width, artwork.width);
    assert.equal(mask.height, artwork.height);
  });

  test(`[${key}] no station marker is anchored in the sea`, () => {
    for (const [slug, pos] of Object.entries(stations)) {
      assert.ok(!isSea(mask, pos.x, pos.y), `${slug} at (${pos.x}, ${pos.y}) is in the water`);
    }
  });

  test(`[${key}] no station marker is mostly sea`, () => {
    // The anchor can be on the last dry pixel of a jetty. What matters is the
    // dot and its halo: a third of it in the water and it reads as floating.
    for (const [slug, pos] of Object.entries(stations)) {
      const wet = seaFraction(mask, pos.x, pos.y, TILE_W, TILE_H);
      assert.ok(wet < 0.34, `${slug}: ${Math.round(wet * 100)}% of its tile is over water`);
    }
  });

  test(`[${key}] the two place labels are on land`, () => {
    assert.ok(!isSea(mask, artwork.hub.x, artwork.hub.y), "the hub is in the sea");
    assert.ok(!isSea(mask, artwork.sociale.x, artwork.sociale.y), "Piazza Sociale is in the sea");
  });

}
