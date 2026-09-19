import assert from "node:assert/strict";
import { test } from "node:test";

import { flipsLabel, labelWidth, markerBox, markerFits } from "./markers.ts";
import { LANDSCAPE, PORTRAIT } from "./positions.ts";

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
// a 375px one (the smallest still made), inside the portal's 20px gutters;
// the landscape at the 60rem column and at a 768px tablet, where it first
// appears. A 320px phone is not a case: two of the eleven names fit on
// neither side of their dot at that width, and nothing sold today is 320.
const CASES: [typeof LANDSCAPE, number][] = [
  [PORTRAIT, 390 - 40],
  [PORTRAIT, 375 - 40],
  [LANDSCAPE, 960],
  [LANDSCAPE, 768 - 40],
];

for (const [artwork, width] of CASES) {
  test(`[${artwork.key}] every dot and its label sit inside the picture at ${width}px`, () => {
    const clipped = Object.entries(artwork.stations)
      .filter(([slug, pos]) => !markerFits(pos, artwork, width, NAMES[slug].length))
      .map(([slug]) => slug);
    assert.deepEqual(clipped, []);
  });
}

test("a label flips to the left of its dot only when the right would run off the picture", () => {
  assert.equal(flipsLabel({ x: 30, y: 50 }, LANDSCAPE, 8), false);
  assert.equal(flipsLabel({ x: 95, y: 50 }, LANDSCAPE, 8), true);
  const right = markerBox({ x: 95, y: 50 }, LANDSCAPE, 8);
  const left = markerBox({ x: 30, y: 50 }, LANDSCAPE, 8);
  assert.ok(right.left > right.right, "a flipped label reaches left");
  assert.ok(left.right > left.left, "an unflipped label reaches right");
  assert.equal(right.left, left.right, "the same label, mirrored");
});

test("the portrait's pill is a size smaller than the landscape's", () => {
  assert.ok(labelWidth(PORTRAIT, 22) < labelWidth(LANDSCAPE, 22));
});

test("the long names fit the phone only because of the smaller pill", () => {
  // Studio dell'Architetto at x=38 on a 350px phone: 22 characters.
  const pos = PORTRAIT.stations["studio-dell-architetto"];
  assert.ok(markerFits(pos, PORTRAIT, 350, 22));
  // At the landscape's 11px it would not fit on either side.
  const cx = (pos.x / 100) * 350;
  const bigReach = 14 / 2 + 9 + labelWidth(LANDSCAPE, 22);
  assert.ok(cx + bigReach > 350 && cx - bigReach < 0);
});

test("Terrazza flips on both pictures: the case the flip exists for", () => {
  assert.equal(flipsLabel(PORTRAIT.stations["terrazza"], PORTRAIT, 8), true);
  assert.equal(flipsLabel(LANDSCAPE.stations["terrazza"], LANDSCAPE, 8), true);
});
