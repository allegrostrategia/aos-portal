/**
 * The coloured lines on La Strada.
 *
 * A map concern, not a data one. `training_content.bucket` tags a *training* with
 * V/L/S/P for the recommendation engine; this groups *stations* into routes for
 * the eye, and the two don't answer the same question. "Your Story" is the clearest
 * evidence — it's a line on the map with no bucket behind it, so putting any of
 * this in the database would mean inventing a fifth enum value that nothing else
 * would ever read.
 *
 * Station order within a line is the drawn route, chosen to keep segments over
 * the town rather than straight across the open square.
 */

export type MapLine = {
  key: string;
  label: string;
  /** A CSS colour — brand tokens where they exist. */
  colour: string;
  /** Ordered: consecutive pairs become segments. */
  stations: string[];
  /** Single-station lines and Your Story colour the marker but draw nothing. */
  drawLine: boolean;
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
    drawLine: true,
  },
  {
    key: "profit",
    label: "Profit",
    // Not a brand token — the palette has no deep red. Picked to sit with the
    // terracotta roofs in the artwork rather than fight them, and defined once
    // in globals.css so it can be changed in one place.
    colour: "var(--aos-deep-red)",
    stations: ["la-boutique", "piazza-caffe", "banco-allegro"],
    drawLine: true,
  },
  {
    key: "visibility",
    label: "Visibility",
    colour: "var(--aos-sky)",
    stations: ["cinema-allegro"],
    drawLine: false,
  },
  {
    key: "launch",
    label: "Launches",
    colour: "var(--aos-orange)",
    stations: ["stazione-centrale"],
    drawLine: false,
  },
  {
    key: "your_story",
    label: "Your Story",
    colour: "var(--aos-navy)",
    stations: ["grand-hotel-riposo", "archivio"],
    // Unlined by design: where a member arrives and where their own work is
    // kept aren't a route between two places.
    drawLine: false,
  },
];

/** The line colour for a station, or null if it's on none. */
export function lineColourFor(slug: string): string | null {
  return MAP_LINES.find((line) => line.stations.includes(slug))?.colour ?? null;
}

export type Point = { x: number; y: number };

/**
 * A segment as an SVG quadratic path, bowed away from the middle of the map.
 *
 * A straight line between the two sides of the town would run right across the
 * open piazza and its fountain, which is the one part of the picture that should
 * stay clear. Pushing the control point outward from the centre makes each
 * segment curve around the square instead — and the closer a segment's midpoint
 * is to the centre, the harder it's pushed.
 */
export function segmentPath(from: Point, to: Point): string {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  const awayX = mid.x - 50;
  const awayY = mid.y - 50;
  const distance = Math.hypot(awayX, awayY);

  // A midpoint sitting exactly on the centre has no outward direction, so fall
  // back to bowing upward rather than dividing by zero.
  const direction =
    distance < 0.01
      ? { x: 0, y: -1 }
      : { x: awayX / distance, y: awayY / distance };

  // Strongest bow at the centre, tapering to almost nothing at the edges.
  const bow = Math.max(0, 26 - distance) * 0.9;

  const control = {
    x: mid.x + direction.x * bow,
    y: mid.y + direction.y * bow,
  };

  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}
