import assert from "node:assert/strict";
import { test } from "node:test";

import { markerBox, typicalWidth } from "./markers.ts";
import { ARTWORKS, aspectOf, mapDistance, unplacedStations } from "./positions.ts";

// The eleven from the reference data migration.
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
const STATIONS = Object.keys(NAMES);

/**
 * The open square on each picture, in percent: the fountain and the stone
 * around it. Piazza is the homepage, not a station, so nothing sits on it.
 * Read off each picture by eye, like the positions themselves.
 */
const SQUARE = {
  landscape: { x: [44, 60], y: [38, 64] },
  portrait: { x: [42, 68], y: [40, 64] },
} as const;

// Every geometric property is checked on both pictures, separately: the
// numbers are different, and a position right on one says nothing about the
// other.
for (const artwork of ARTWORKS) {
  const { key, stations } = artwork;
  // A dot with its halo is 26px; a label beside it is what actually takes
  // the room. Overlap is checked on the real rectangles below; this is the
  // floor for the dots themselves, in percent of the width.
  const CLEAR = (26 / typicalWidth(artwork)) * 100 + 0.5;

  test(`[${key}] every station has a position — an unplaced one would be invisible`, () => {
    assert.deepEqual(unplacedStations(STATIONS, artwork), []);
  });

  test(`[${key}] no positions for stations that don't exist`, () => {
    for (const slug of Object.keys(stations)) assert.ok(STATIONS.includes(slug), `${slug} is not a station`);
  });

  test(`[${key}] every marker sits inside the picture`, () => {
    for (const [slug, pos] of Object.entries(stations)) {
      assert.ok(pos.x > 5 && pos.x < 95, `${slug} x is off the edge`);
      assert.ok(pos.y > 5 && pos.y < 95, `${slug} y is off the edge`);
    }
  });

  test(`[${key}] no two stations sit on top of each other`, () => {
    // Measured with mapDistance, because 10% down is not the same distance as
    // 10% across unless the picture is square, and a plain hypotenuse would
    // call a vertical near-miss safe on the landscape and a horizontal one
    // safe on the portrait.
    const entries = Object.entries(stations);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [aSlug, a] = entries[i];
        const [bSlug, b] = entries[j];
        const distance = mapDistance(a, b, artwork);
        assert.ok(distance > CLEAR, `${aSlug} and ${bSlug} are ${distance.toFixed(1)} apart`);
      }
    }
  });

  test(`[${key}] no dot-and-label pair overlaps another at the picture's usual width`, () => {
    // The rectangles a dot and its pill actually occupy, in pixels, at the
    // width the picture is usually seen at. What "too close" means now that
    // markers are a dot with a name beside it rather than a square tile.
    const width = typicalWidth(artwork);
    const height = width * (artwork.height / artwork.width);
    const rects = Object.entries(stations).map(([slug, pos]) => {
      const box = markerBox(pos, artwork, NAMES[slug].length, slug);
      const cx = (pos.x / 100) * width;
      const cy = (pos.y / 100) * height;
      return { slug, l: cx - box.left, r: cx + box.right, t: cy - box.up, b: cy + box.down };
    });
    // The two place labels, where the picture draws them: ~100px pills,
    // centred on their point.
    if (artwork.placeLabels) {
      for (const [slug, pos, w] of [["Piazza. Home", artwork.hub, 100], ["Piazza Sociale", artwork.sociale, 110]] as const) {
        const cx = (pos.x / 100) * width;
        const cy = (pos.y / 100) * height;
        rects.push({ slug, l: cx - w / 2, r: cx + w / 2, t: cy - 12, b: cy + 12 });
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlaps = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        assert.ok(!overlaps, `${a.slug} and ${b.slug} overlap`);
      }
    }
  });

  test(`[${key}] nothing is dropped on the hub or the Piazza Sociale label`, () => {
    for (const [slug, pos] of Object.entries(stations)) {
      assert.ok(mapDistance(pos, artwork.hub, artwork) > CLEAR, `${slug} overlaps the hub`);
      assert.ok(mapDistance(pos, artwork.sociale, artwork) > CLEAR, `${slug} overlaps Piazza Sociale`);
    }
    assert.ok(mapDistance(artwork.hub, artwork.sociale, artwork) > 6, "the two labels collide");
  });



  test(`[${key}] the open piazza in the middle is left clear`, () => {
    const sq = SQUARE[key];
    for (const [slug, pos] of Object.entries(stations)) {
      const inSquare = pos.x > sq.x[0] && pos.x < sq.x[1] && pos.y > sq.y[0] && pos.y < sq.y[1];
      assert.ok(!inSquare, `${slug} is sitting in the middle of the piazza`);
    }
    // And the hub is in it: the square is where the fountain is.
    assert.ok(artwork.hub.x > sq.x[0] && artwork.hub.x < sq.x[1] && artwork.hub.y > sq.y[0] && artwork.hub.y < sq.y[1]);
  });
}

test("the two pictures are the shapes the component expects", () => {
  assert.ok(aspectOf(ARTWORKS[0]) > 1, "landscape is wider than tall");
  assert.ok(aspectOf(ARTWORKS[1]) < 1, "portrait is taller than wide");
});
