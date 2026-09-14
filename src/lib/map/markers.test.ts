import assert from "node:assert/strict";
import { test } from "node:test";

import { markerBox, markerFits, namePlacement } from "./markers.ts";
import { STATION_POSITIONS } from "./positions.ts";

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

// The layer's width in the two real cases: a phone (390px screen, 16px
// gutters, 1px borders, drawn at 200%) and a laptop (the 60rem column).
const PHONE = 2 * (390 - 32 - 2);
const LAPTOP = 960;

for (const width of [PHONE, LAPTOP]) {
  test(`every marker, name included, fits inside the frame at ${width}px`, () => {
    const clipped = Object.entries(STATION_POSITIONS)
      .filter(([slug, pos]) => !markerFits(pos, width, NAMES[slug].length))
      .map(([slug]) => slug);
    assert.deepEqual(clipped, []);
  });
}

test("the top row carries its name below the tile; everything else above", () => {
  assert.equal(namePlacement(STATION_POSITIONS["cinema-allegro"].y), "below");
  assert.equal(namePlacement(STATION_POSITIONS["studio-dell-architetto"].y), "below");
  assert.equal(namePlacement(STATION_POSITIONS["officina-vespa"].y), "above");
  assert.equal(namePlacement(STATION_POSITIONS["archivio"].y), "above");
});

test("a name above a top-row tile would not have fit — the reason for the flip", () => {
  // The same marker with the name forced above: what shipped before 14 Sep.
  const pos = STATION_POSITIONS["cinema-allegro"];
  const box = markerBox(pos.y, PHONE, NAMES["cinema-allegro"].length, "above");
  const cy = (pos.y / 100) * PHONE * (864 / 1536);
  assert.ok(cy - box.above < 0, `top would be at ${(cy - box.above).toFixed(1)}px`);
});
