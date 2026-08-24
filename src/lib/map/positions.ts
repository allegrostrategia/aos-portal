/**
 * Where each station sits on the La Strada artwork.
 *
 * Percentages of `public/illustrations/la-strada-map.png`, so the markers scale
 * with the image at any zoom rather than needing a second set of numbers.
 *
 * Placed by eye against the picture: the church on the rise, the harbour at the
 * bottom left, the terraces on the right. They avoid the open piazza in the
 * middle — that's the fountain and the square itself, and Piazza is the daily
 * homepage rather than a station.
 *
 * These are a first pass and meant to be nudged. Changing the artwork, or even
 * cropping it differently, means re-checking every one.
 */

export type MapPosition = { x: number; y: number };

export const STATION_POSITIONS: Record<string, MapPosition> = {
  // The landmark church above the square — where a member arrives.
  "grand-hotel-riposo": { x: 52, y: 15 },
  "studio-dell-architetto": { x: 33, y: 12 },
  "cinema-allegro": { x: 68, y: 12 },
  "officina-vespa": { x: 78, y: 30 },
  "piazza-caffe": { x: 32, y: 42 },
  "banco-allegro": { x: 72, y: 52 },
  "la-boutique": { x: 24, y: 57 },
  "archivio": { x: 82, y: 58 },
  "terrazza": { x: 68, y: 78 },
  // The harbour, where things set off from.
  "stazione-centrale": { x: 15, y: 82 },
  "club-allegro": { x: 46, y: 88 },
};

/** Anything without a position would be invisible, so it's worth knowing. */
export function unplacedStations(slugs: string[]): string[] {
  return slugs.filter((slug) => !(slug in STATION_POSITIONS));
}
