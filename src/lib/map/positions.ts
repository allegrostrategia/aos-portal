import { LANDSCAPE_MASK } from "./masks/landscape.ts";
import { PORTRAIT_MASK } from "./masks/portrait.ts";
import type { LandMask } from "./land-mask.ts";

/**
 * Where everything sits on The Map: two artworks, two sets of numbers.
 *
 * **Third artwork, 19 Sep 2026.** The Map is drawn from two pictures of the
 * same town: a landscape one (1672×941) for screens 768px and wider, a
 * portrait one (1086×1448) for phones, which fits the width with no
 * side-scroll. Unlike the earlier pictures, this pair paints every station as
 * its own building with its name on it: the temple is BANCO, the marquee
 * says CINEMA, the blue awning says GRAND HOTEL RIPOSO, and so on. So a dot
 * goes on its building, on each picture, and "where should this go" stopped
 * being a judgement. Percentages of each picture, placed against it, then
 * rendered and looked at, then checked by that picture's land mask and the
 * geometry tests. Nothing here is copied from one picture to the other.
 *
 * Two of the eleven have no sign: Piazza Caffè is the striped umbrellas on
 * the square's left, La Boutique the row of coloured shopfronts behind them.
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
  /**
   * Labels that go on the left of their dot even though the right would
   * fit: where the right would run into a neighbour's label. The geometric
   * rule in lib/map/markers handles the picture's edge; this handles the
   * neighbours, by hand, checked by the overlap test.
   */
  labelLeft?: string[];
  /** Whether the "Piazza. Home" and "Piazza Sociale" labels are drawn. */
  placeLabels: boolean;
  mask: LandMask;
};

export const LANDSCAPE: MapArtwork = {
  key: "landscape",
  file: "the-map-landscape.jpg",
  width: 1672,
  height: 941,
  hub: { x: 49.6, y: 48.4 },
  sociale: { x: 58, y: 60 },
  stations: {
    // Just below the blue awning (Dom, 19 Sep, from a screenshot).
    "grand-hotel-riposo": { x: 12.9, y: 62 },
    // The building's left edge, a little above it, so the label (which
    // reaches left) sits beside the building rather than across it.
    "studio-dell-architetto": { x: 78, y: 9 },
    // The cinema's right edge, so the label sits beside it (Dom, 19 Sep).
    "cinema-allegro": { x: 73, y: 30 },
    // Down on the road between the trees below the workshop.
    "officina-vespa": { x: 66.4, y: 60 },
    // In from the edge far enough that the label fits on the right at 768px,
    // which is what puts it to the right of the dot (Dom, 19 Sep).
    "terrazza": { x: 80, y: 45 },
    "club-allegro": { x: 26.6, y: 31.9 },
    "piazza-caffe": { x: 33.5, y: 47.8 },
    // The temple's columns; the label goes left of the building (below).
    "banco-allegro": { x: 55.6, y: 24 },
    "la-boutique": { x: 44, y: 34 },
    "stazione-centrale": { x: 38.9, y: 73.3 },
    // The building's right edge, so the label sits beside it, not on it.
    "archivio": { x: 30, y: 18 },
  },
  // Piazza Caffè is right beside the fountain; its label goes left so it
  // doesn't sit on the "Piazza. Home" label. Banco's goes left of the temple
  // rather than across its front (Dom, 19 Sep).
  labelLeft: ["piazza-caffe", "banco-allegro"],
  placeLabels: true,
  mask: LANDSCAPE_MASK,
};

export const PORTRAIT: MapArtwork = {
  key: "portrait",
  file: "the-map-portrait.jpg",
  width: 1086,
  height: 1448,
  hub: { x: 52.5, y: 48.3 },
  sociale: { x: 57, y: 56.6 },
  stations: {
    "grand-hotel-riposo": { x: 14.7, y: 62 },
    "studio-dell-architetto": { x: 86.1, y: 14.2 },
    "cinema-allegro": { x: 72.7, y: 26 },
    "officina-vespa": { x: 75, y: 53.5 },
    "terrazza": { x: 88.4, y: 40.7 },
    "club-allegro": { x: 14.7, y: 34 },
    "piazza-caffe": { x: 31.3, y: 47 },
    "banco-allegro": { x: 57.6, y: 20 },
    // The shopfronts' awnings rather than their roofs, clear of Club Allegro's
    // label reaching in from the left edge.
    "la-boutique": { x: 40, y: 41 },
    "stazione-centrale": { x: 55.2, y: 68.4 },
    "archivio": { x: 24.9, y: 20 },
  },
  // At phone width six labels share the band from 20% to 50% down. La
  // Boutique's goes left so it doesn't meet Terrazza's coming the other way.
  labelLeft: ["la-boutique"],
  // No "Piazza. Home" / "Piazza Sociale" labels on the phone: at 350px the
  // square is a hundred-pixel patch under six station pills and the two
  // labels land on one of them wherever they go. Both places are a tap away
  // in the bottom bar. The spokes still meet at the fountain.
  placeLabels: false,
  mask: PORTRAIT_MASK,
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
