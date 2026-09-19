import { LANDSCAPE_MASK } from "./masks/landscape.ts";
import { PORTRAIT_MASK } from "./masks/portrait.ts";
import type { LandMask } from "./land-mask.ts";

/**
 * Where everything sits on The Map: two artworks, two sets of numbers.
 *
 * Since 19 Sep 2026 The Map is drawn from two pictures of the same town: a
 * landscape one (1536×1024) for screens 768px and wider, a portrait one
 * (941×1672) for phones, which then fits the width with no side-scroll. Both
 * show the same square, church, harbour and terraces from different angles,
 * so every station is in the same *place* on each but at different
 * coordinates. Percentages of each picture, placed by eye against it, then
 * rendered and looked at, then checked by that picture's land mask and the
 * geometry tests. Nothing here is copied from one picture to the other.
 *
 * Three rules shape both layouts:
 *   · nothing on the open square — that's the fountain and the piazza itself,
 *     and Piazza is the daily homepage rather than a station
 *   · the Your Story pair sits low and wide apart — the harbour at one end,
 *     Archivio at the other — so a line can run between them along the shore
 *     road without cutting through anything else
 *   · everything else rings the square, on the buildings and terraces, so a
 *     spoke from the middle has somewhere to land
 */

export type MapPosition = { x: number; y: number };
export type ArtworkKey = "landscape" | "portrait";

export type MapArtwork = {
  key: ArtworkKey;
  /** Under public/illustrations. */
  file: string;
  width: number;
  height: number;
  /** The middle of the square, at the fountain. Every spoke starts here. */
  hub: MapPosition;
  /** Chat and the directory, just off the fountain. A label, not a station. */
  sociale: MapPosition;
  stations: Record<string, MapPosition>;
  /** The bends the Your Story line takes between the harbour and Archivio. */
  storyWaypoints: MapPosition[];
  mask: LandMask;
  /** A marker tile's width as a percentage of the picture's width, and its floor. */
  tilePercent: number;
  tileFloorRem: number;
};

export const LANDSCAPE: MapArtwork = {
  key: "landscape",
  file: "the-map-landscape.jpg",
  width: 1536,
  height: 1024,
  hub: { x: 52.5, y: 49 },
  sociale: { x: 45, y: 59 },
  stations: {
    // The arcaded terraces above the marina, bottom left: where a member arrives.
    "grand-hotel-riposo": { x: 22, y: 73 },
    // Above the square, either side of the church.
    "studio-dell-architetto": { x: 31, y: 13 },
    "cinema-allegro": { x: 71, y: 12 },
    // The terraces down the right.
    "officina-vespa": { x: 81, y: 26 },
    "terrazza": { x: 88, y: 45 },
    "club-allegro": { x: 79, y: 63 },
    // The buildings down the left.
    "piazza-caffe": { x: 24, y: 30 },
    "banco-allegro": { x: 19, y: 46 },
    // Up a little from the harbour, so the hotel's name (which sits above
    // its tile) doesn't run under this tile. Found in a render, not a test.
    "la-boutique": { x: 31, y: 57 },
    // The bottom, where the town meets the water.
    "stazione-centrale": { x: 45, y: 81 },
    "archivio": { x: 67, y: 88 },
  },
  storyWaypoints: [
    // On the harbour road. (30, 89) looked like the quay's edge in a render
    // and was water by the mask: the same mistake as the first artwork's.
    { x: 33, y: 88 },
    { x: 50, y: 94 },
  ],
  mask: LANDSCAPE_MASK,
  tilePercent: 8.8,
  tileFloorRem: 3.5,
};

export const PORTRAIT: MapArtwork = {
  key: "portrait",
  file: "the-map-portrait.jpg",
  width: 941,
  height: 1672,
  hub: { x: 57, y: 48 },
  sociale: { x: 56, y: 62 },
  stations: {
    // In from the edges enough that the names fit on a 320px phone: the fit
    // test found Officina, Terrazza and the hotel poking out at 280px wide.
    "grand-hotel-riposo": { x: 22, y: 69 },
    "studio-dell-architetto": { x: 38, y: 13 },
    "cinema-allegro": { x: 78, y: 12 },
    "officina-vespa": { x: 81, y: 30 },
    "terrazza": { x: 87, y: 46 },
    "club-allegro": { x: 82, y: 62 },
    "piazza-caffe": { x: 24, y: 31 },
    "banco-allegro": { x: 18, y: 46 },
    "la-boutique": { x: 35, y: 57 },
    "stazione-centrale": { x: 48, y: 74 },
    "archivio": { x: 70, y: 80 },
  },
  storyWaypoints: [
    // Down the harbour road, then across the houses at the foot of the town.
    // The first version's second bend was on the rocks at the water's edge,
    // and the curve after it swung out over the sea.
    { x: 21, y: 78 },
    { x: 50, y: 83 },
  ],
  mask: PORTRAIT_MASK,
  // A phone is ~390px wide: 14% is a 49px tile, about a thumb. The floor is
  // lower than the landscape's (3rem against 3.5rem) so eleven of them and
  // their names fit a 350px picture without piling up; found in a render.
  tilePercent: 14,
  tileFloorRem: 3,
};

export const ARTWORKS: MapArtwork[] = [LANDSCAPE, PORTRAIT];

/** Anything without a position would be invisible, so it's worth knowing. */
export function unplacedStations(slugs: string[], artwork: MapArtwork = LANDSCAPE): string[] {
  return slugs.filter((slug) => !(slug in artwork.stations));
}

/** Width over height: how much further 10% across is than 10% down. */
export function aspectOf(artwork: MapArtwork): number {
  return artwork.width / artwork.height;
}

/**
 * Distance between two points, in percent-of-width.
 *
 * x and y percentages measure different physical lengths unless the picture is
 * square — on the landscape, 10% across is 1.5× further than 10% down; on the
 * portrait, 0.56×. Everything that asks "are these two too close" needs this
 * rather than a plain hypotenuse.
 */
export function mapDistance(a: MapPosition, b: MapPosition, artwork: MapArtwork = LANDSCAPE): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspectOf(artwork));
}
