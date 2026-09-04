/**
 * Where each station sits on the La Strada artwork.
 *
 * Percentages of `public/illustrations/la-strada-map.png`, so the markers scale
 * with the image at any zoom rather than needing a second set of numbers.
 *
 * **Recalculated 4 Sep for the 16:9 crop.** The artwork was 3:2 and is now
 * 1536×864, so every one of these moved. Placed by eye against the actual
 * picture rather than copied from the design reference: the reference is a
 * separately-generated render of the same scene, not a crop of this file — its
 * fountain sits at 41% across where ours is at 51%, and no crop moves content
 * outward. Its look transfers; its coordinates don't.
 *
 * Three rules shape the layout:
 *   · nothing on the open square — that's the fountain and the piazza itself,
 *     and Piazza is the daily homepage rather than a station
 *   · the Your Story pair sits along the bottom, far enough apart for a line to
 *     run between them without cutting through anything else
 *   · everything else rings the square, on the buildings and terraces, so a
 *     spoke from the middle has somewhere to land
 */

export type MapPosition = { x: number; y: number };

/**
 * The middle of the square, at the fountain.
 *
 * Every coloured line radiates from here (§3: Piazza is home, and the stations
 * are reached from it). Not a station and not in `STATION_POSITIONS` — nothing
 * should place a marker on it.
 */
export const PIAZZA_HUB: MapPosition = { x: 51.5, y: 48 };

/** Chat and the directory, just off the fountain. A label, not a station. */
export const PIAZZA_SOCIALE: MapPosition = { x: 42, y: 60 };

export const STATION_POSITIONS: Record<string, MapPosition> = {
  // The harbour road, bottom left — where a member arrives.
  "grand-hotel-riposo": { x: 12, y: 80 },
  // Above the square, either side of the church.
  "studio-dell-architetto": { x: 36, y: 11 },
  "cinema-allegro": { x: 62, y: 10 },
  // The terraces down the right.
  "officina-vespa": { x: 73, y: 20 },
  "terrazza": { x: 85, y: 40 },
  "club-allegro": { x: 78, y: 60 },
  // The buildings down the left.
  "piazza-caffe": { x: 28, y: 30 },
  "banco-allegro": { x: 17, y: 47 },
  "la-boutique": { x: 26, y: 62 },
  // The bottom, where the town meets the water.
  "stazione-centrale": { x: 40, y: 80 },
  "archivio": { x: 62, y: 84 },
};

/**
 * The two bends the Your Story line takes between its stations.
 *
 * A straight run from the harbour to Archivio would cut across the buildings at
 * the foot of the square; dropping it below keeps it on the road already there
 * in the picture. Each bend carries a visible dot — the "Your Story Stations"
 * the legend names, which mark where the line touches down rather than marking
 * the stations themselves.
 */
export const YOUR_STORY_WAYPOINTS: MapPosition[] = [
  { x: 22, y: 88 },
  { x: 50, y: 90 },
];

/** Anything without a position would be invisible, so it's worth knowing. */
export function unplacedStations(slugs: string[]): string[] {
  return slugs.filter((slug) => !(slug in STATION_POSITIONS));
}

/**
 * Distance between two points, in percent-of-width.
 *
 * x and y percentages measure different physical lengths on a 16:9 image — 10%
 * across is 1.78× further than 10% down — so comparing them directly
 * understates vertical gaps and overstates horizontal ones. Everything that
 * asks "are these two too close" needs this rather than a plain hypotenuse.
 */
export const MAP_ASPECT = 16 / 9;

export function mapDistance(a: MapPosition, b: MapPosition): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / MAP_ASPECT);
}
