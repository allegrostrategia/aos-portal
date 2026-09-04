import {
  PIAZZA_HUB,
  STATION_POSITIONS,
  YOUR_STORY_WAYPOINTS,
  type MapPosition,
} from "./positions.ts";

/**
 * The coloured lines on La Strada.
 *
 * A map concern, not a data one. `training_content.bucket` tags a *training*
 * with V/L/S/P for the recommendation engine; this groups *stations* into routes
 * for the eye, and the two don't answer the same question. "Your Story" is the
 * clearest evidence — a line on the map with no bucket behind it, so putting any
 * of this in the database would mean inventing a fifth enum value nothing else
 * would read.
 *
 * **Hub and spoke, not a chain (4 Sep).** Every coloured line radiates from the
 * fountain in the middle of the square, because that is what Piazza is: the
 * daily homepage everything is reached from. The previous version ran each line
 * station-to-station, which drew a plausible map of somewhere else — a route
 * between shops rather than a set of places you go from home.
 */

export type MapLine = {
  key: string;
  label: string;
  /** The bucket colour: badges, marker borders, and the legend swatch. */
  colour: string;
  /**
   * The drawn line, where it differs from the badge.
   *
   * Your Story is the only case: navy badges, because that is the bucket
   * colour, and a pale line, because a bold navy route along the bottom of the
   * picture competes with the coloured spokes for something that isn't a route
   * through the town at all.
   */
  lineColour?: string;
  /** Ordered. Spokes run hub → station; Your Story runs between its own two. */
  stations: string[];
  /** Its own path along the bottom rather than spokes from the hub. */
  ownRoute?: boolean;
};

export const MAP_LINES: MapLine[] = [
  {
    key: "systems_delivery",
    label: "Systems & Delivery",
    colour: "var(--aos-gold)",
    stations: [
      "studio-dell-architetto",
      "officina-vespa",
      "terrazza",
      "club-allegro",
    ],
  },
  {
    key: "visibility",
    label: "Visibility & Growth",
    colour: "var(--aos-sky)",
    stations: ["cinema-allegro"],
  },
  {
    key: "launch",
    label: "Launches",
    colour: "var(--aos-orange)",
    stations: ["stazione-centrale"],
  },
  {
    key: "profit",
    label: "Profit",
    // Not a brand token — the palette has no deep red. Picked to sit with the
    // terracotta roofs rather than fight them, and defined once in globals.css.
    colour: "var(--aos-deep-red)",
    stations: ["la-boutique", "piazza-caffe", "banco-allegro"],
  },
  {
    key: "your_story",
    label: "Your Story",
    colour: "var(--aos-navy)",
    lineColour: "var(--aos-off-white)",
    stations: ["grand-hotel-riposo", "archivio"],
    ownRoute: true,
  },
];

/** The bucket colour for a station, or null if it's on none. */
export function lineColourFor(slug: string): string | null {
  return MAP_LINES.find((line) => line.stations.includes(slug))?.colour ?? null;
}

/** What a line is actually drawn in. */
export function strokeColourFor(line: MapLine): string {
  return line.lineColour ?? line.colour;
}

export type Point = MapPosition;

/**
 * A spoke from the hub out to a station, as a gently curved path.
 *
 * Straight spokes would read as a diagram rather than as roads through a town.
 * The control point is pushed perpendicular to the run, by a fraction of its
 * length, so a long spoke bends more than a short one and none of them bows so
 * hard it wanders into a neighbour.
 *
 * `bend` is signed and comes from the caller, so two spokes leaving the hub in
 * nearly the same direction can be curved apart rather than laid on top of each
 * other. Deterministic — the same station always bends the same way.
 */
export function spokePath(station: Point, bend: number, hub: Point = PIAZZA_HUB): string {
  const dx = station.x - hub.x;
  const dy = station.y - hub.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.01) return `M ${hub.x} ${hub.y} L ${station.x} ${station.y}`;

  // Perpendicular to the run, scaled by how far it goes.
  const offset = length * 0.14 * bend;
  const control = {
    x: hub.x + dx / 2 - (dy / length) * offset,
    y: hub.y + dy / 2 + (dx / length) * offset,
  };

  return `M ${hub.x} ${hub.y} Q ${control.x} ${control.y} ${station.x} ${station.y}`;
}

/**
 * How far each spoke on a line bends, and which way.
 *
 * Alternating outward from the middle of the group keeps a line's spokes fanned
 * rather than stacked: the first pair bends slightly apart, the next pair a
 * little more. A single-station line gets no bend at all — there is nothing to
 * separate it from.
 */
export function bendFor(index: number, total: number): number {
  if (total < 2) return 0;
  const step = index - (total - 1) / 2;
  return step * 0.7;
}

/**
 * The Your Story line: harbour, along the bottom, up to Archivio.
 *
 * Drawn through its waypoints as a smooth chain — `Q` for the first bend, then
 * `T` to continue with the mirrored control point, so the joins don't kink.
 *
 * It has a route at all because arriving somewhere and keeping what you built
 * there are two ends of the same story. An earlier version drew nothing here on
 * the reasoning that they aren't a route between two places; that was overruled
 * on 4 Sep — the line is the point, and its absence read as an omission.
 */
export function storyPath(points: Point[]): string {
  if (points.length < 2) return "";

  const [start, ...rest] = points;
  if (rest.length === 1) {
    return `M ${start.x} ${start.y} L ${rest[0].x} ${rest[0].y}`;
  }

  // Control point for the first curve: pulled below the first bend so the line
  // leaves the harbour heading along the shore rather than cutting inland.
  const [first, ...others] = rest;
  const control = { x: (start.x + first.x) / 2, y: Math.max(start.y, first.y) + 2 };

  return [
    `M ${start.x} ${start.y}`,
    `Q ${control.x} ${control.y} ${first.x} ${first.y}`,
    ...others.map((p) => `T ${p.x} ${p.y}`),
  ].join(" ");
}

/** The full Your Story path, stations and bends in order. */
export function yourStoryPoints(): Point[] {
  const line = MAP_LINES.find((l) => l.ownRoute);
  if (!line) return [];

  const [from, to] = line.stations.map((slug) => STATION_POSITIONS[slug]);
  if (!from || !to) return [];

  return [from, ...YOUR_STORY_WAYPOINTS, to];
}
