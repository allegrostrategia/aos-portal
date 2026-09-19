import assert from "node:assert/strict";
import { test } from "node:test";

import { markerBox, markerFits, namePlacement } from "./markers.ts";
import { ARTWORKS, LANDSCAPE, PORTRAIT } from "./positions.ts";

// The names as they appear on the map, from the reference data migration.
const NAMES: Record<string, string> = {
  "grand-hotel-riposo": "Grand Hotel Riposo",
  "studio-dell-architetto": "Studio dell'Architetto",
  "officina-vespa": "Officina Vespa",
  "cinema-allegro": "Cinema Allegro",
  "piazza-caffe": "Piazza Caffè",
  "la-boutique": "La Boutique",
  "banco-allegro": "Banco Allegro",
  "stazione-centrale": "Stazione Centrale",
  "terrazza": "Terrazza",
  "club-allegro": "Club Allegro",
  "archivio": "Archivio",
};

// The layer's width in the real cases: the portrait on a 390px phone and on
// a 320px one, inside the portal's 20px gutters; the landscape at the 60rem
// column and at a 768px tablet, where it first appears.
const CASES: [typeof LANDSCAPE, number][] = [
  [PORTRAIT, 390 - 40],
  [PORTRAIT, 320 - 40],
  [LANDSCAPE, 960],
  [LANDSCAPE, 768 - 40],
];

for (const [artwork, width] of CASES) {
  test(`[${artwork.key}] every marker, name included, fits inside the picture at ${width}px`, () => {
    const clipped = Object.entries(artwork.stations)
      .filter(([slug, pos]) => !markerFits(pos, artwork, width, NAMES[slug].length))
      .map(([slug]) => slug);
    assert.deepEqual(clipped, []);
  });
}

for (const artwork of ARTWORKS) {
  test(`[${artwork.key}] a name goes under its tile only when it would not fit above`, () => {
    // On these pictures every station has room above (the top row sits at
    // 12–13% of a picture taller than the old 16:9 one), so nothing flips.
    for (const [slug, pos] of Object.entries(artwork.stations)) {
      assert.equal(namePlacement(pos, artwork), "above", `${slug} flipped without needing to`);
    }
    // A marker hard against the top edge would.
    assert.equal(namePlacement({ x: 50, y: 3 }, artwork), "below");
  });
}

test("the flip is decided by the geometry, not a threshold: the same y flips on one picture and not the other", () => {
  // y = 9%: 58px on the landscape at 960 wide (a tile's half-height is 37px,
  // a name 31px: no room), 100px on the portrait at 350 (room to spare).
  assert.equal(markerBox({ x: 50, y: 9 }, LANDSCAPE, 960, 8).placement, "below");
  assert.equal(markerBox({ x: 50, y: 9 }, PORTRAIT, 350, 8).placement, "above");
});
