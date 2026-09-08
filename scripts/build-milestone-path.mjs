/**
 * Traces the road on the milestone artwork into an ordered path.
 *
 * Run this whenever `public/illustrations/milestone-path.png` changes:
 *
 *     node scripts/build-milestone-path.mjs
 *
 * The consuming test checks the artwork's hash, so a changed picture fails
 * loudly rather than drawing a road that is no longer there.
 *
 * **The problem this solves is ordering, not detection.** Detecting asphalt is
 * easy — grey, low saturation, mid luminance. Two things make it harder than it
 * looks:
 *
 *  · The same rule matches pale walls, rooftops, rocks and boat wakes. They are
 *    all separate blobs, so connectivity throws them out, exactly as the sea
 *    mask does on La Strada.
 *  · 52% of horizontal lines cross this road twice, because it switches back on
 *    itself. So "how far along" cannot be read off the height. Distance has to
 *    be measured *along the ribbon*, which is what the flood fill below does:
 *    every cell gets its geodesic distance from the top end, and that is a
 *    well-defined ordering through every hairpin.
 *
 * Tree canopy breaks the road into three pieces on this artwork. They are
 * bridged by nearest-pair, rather than by hardcoded coordinates, so a redraw
 * with the shadows in different places still works.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ART = fileURLToPath(new URL("../public/illustrations/milestone-path.png", import.meta.url));
const OUT = fileURLToPath(new URL("../src/lib/hours/milestone-path.ts", import.meta.url));

/** Trace resolution. Well under the road's width, which is ~40px here. */
const CELL = 4;
/** Mask resolution for the "is this on the road" check. Coarser, to stay small. */
const MASK_CELL = 16;
/** A cell is road when this much of it is asphalt-coloured. */
const FILL = 0.6;
/**
 * Both ends are trimmed by this much, so the first and last markers sit inside
 * the frame instead of half over the edge — and so the road visibly carries on
 * past the last milestone, which is also true of the membership.
 */
const INSET = 0.04;
/** Points in the emitted path. Evenly spaced by distance along the road. */
const SAMPLES = 200;

const { data, info } = await sharp(ART).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

function isAsphalt(i) {
  const R = data[i];
  const G = data[i + 1];
  const B = data[i + 2];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return saturation < 0.2 && luminance > 55 && luminance < 150;
}

function grid(cell) {
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let total = 0;
      let hit = 0;
      for (let y = r * cell; y < Math.min(H, (r + 1) * cell); y++) {
        for (let x = c * cell; x < Math.min(W, (c + 1) * cell); x++) {
          total++;
          if (isAsphalt((y * W + x) * C)) hit++;
        }
      }
      row.push(hit / total > FILL);
    }
    out.push(row);
  }
  return { cols, rows, cells: out };
}

/** 8-connected components, largest first. */
function components({ cols, rows, cells }) {
  const label = cells.map((row) => row.map(() => 0));
  const found = [];
  let next = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cells[r][c] || label[r][c]) continue;
      const id = next++;
      const members = [];
      const stack = [[r, c]];
      label[r][c] = id;
      while (stack.length) {
        const [a, b] = stack.pop();
        members.push([a, b]);
        for (let da = -1; da <= 1; da++) {
          for (let db = -1; db <= 1; db++) {
            const na = a + da;
            const nb = b + db;
            if (na < 0 || nb < 0 || na >= rows || nb >= cols) continue;
            if (label[na][nb] || !cells[na][nb]) continue;
            label[na][nb] = id;
            stack.push([na, nb]);
          }
        }
      }
      found.push(members);
    }
  }
  return found.sort((a, b) => b.length - a.length);
}

const trace = grid(CELL);
const blobs = components(trace);

// Keep the pieces of road. Everything the colour rule caught that is smaller
// than a twentieth of the main run is a rooftop or a wake, not a carriageway.
const minimum = blobs[0].length * 0.05;
const pieces = blobs.filter((b) => b.length >= minimum);

const road = new Set();
for (const piece of pieces) for (const [r, c] of piece) road.add(`${r},${c}`);

// Bridge the canopy breaks: repeatedly join the two nearest disconnected pieces.
const groups = pieces.map((p) => [...p]);
while (groups.length > 1) {
  let best = null;
  for (let i = 1; i < groups.length; i++) {
    for (const [r1, c1] of groups[0]) {
      for (const [r2, c2] of groups[i]) {
        const d = Math.hypot(r1 - r2, c1 - c2);
        if (!best || d < best.d) best = { d, i, from: [r1, c1], to: [r2, c2] };
      }
    }
  }
  const steps = Math.ceil(best.d);
  for (let s = 0; s <= steps; s++) {
    const r = Math.round(best.from[0] + ((best.to[0] - best.from[0]) * s) / steps);
    const c = Math.round(best.from[1] + ((best.to[1] - best.from[1]) * s) / steps);
    road.add(`${r},${c}`);
    groups[0].push([r, c]);
  }
  groups[0].push(...groups[best.i]);
  groups.splice(best.i, 1);
  console.log(`bridged a ${(best.d * CELL).toFixed(0)}px break at row ${best.from[0]}`);
}

const onRoad = (r, c) => road.has(`${r},${c}`);

// Start at the top of the road: the brief is that zero hours is what you see
// first, and progress runs downward as hours accrue.
let start = null;
for (let r = 0; r < trace.rows && !start; r++) {
  for (let c = 0; c < trace.cols; c++) if (onRoad(r, c)) { start = [r, c]; break; }
}

// Geodesic distance along the ribbon. This is the ordering; height is not.
const distance = new Map();
distance.set(`${start[0]},${start[1]}`, 0);
let frontier = [start];
let longest = 0;
while (frontier.length) {
  const next = [];
  for (const [r, c] of frontier) {
    const d = distance.get(`${r},${c}`);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;
        if (distance.has(key) || !onRoad(nr, nc)) continue;
        distance.set(key, d + 1);
        longest = Math.max(longest, d + 1);
        next.push([nr, nc]);
      }
    }
  }
  frontier = next;
}

// The centreline: the centroid of everything at each distance is the middle of
// the carriageway there, and taking them in distance order walks the road.
const bands = new Map();
for (const [key, d] of distance) {
  const [r, c] = key.split(",").map(Number);
  const band = bands.get(d) ?? { r: 0, c: 0, n: 0 };
  band.r += r;
  band.c += c;
  band.n++;
  bands.set(d, band);
}

const centreline = [...bands.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([d, b]) => ({
    d,
    x: (((b.c / b.n) * CELL + CELL / 2) / W) * 100,
    y: (((b.r / b.n) * CELL + CELL / 2) / H) * 100,
  }));

/** The point a fraction of the way along, by distance rather than by index. */
function pointAt(fraction) {
  const target = longest * (INSET + fraction * (1 - 2 * INSET));
  let best = centreline[0];
  for (const p of centreline) {
    if (Math.abs(p.d - target) < Math.abs(best.d - target)) best = p;
  }
  return { x: Number(best.x.toFixed(2)), y: Number(best.y.toFixed(2)) };
}

const path = Array.from({ length: SAMPLES }, (_, i) => pointAt(i / (SAMPLES - 1)));

const MILESTONES = [50, 100, 250, 500, 750];
const markers = MILESTONES.map((hours, i) => ({
  hours,
  ...pointAt((i + 1) / MILESTONES.length),
}));

// The coarse mask, for checking a marker is on the road without re-deriving it.
const maskGrid = grid(MASK_CELL);
const maskRows = maskGrid.cells
  .map((row, r) =>
    row
      .map((hit, c) => {
        if (!hit) return ".";
        // Only cells belonging to the traced road, so a rooftop stays a rooftop.
        const rr = Math.floor((r * MASK_CELL) / CELL);
        const cc = Math.floor((c * MASK_CELL) / CELL);
        for (let a = 0; a <= MASK_CELL / CELL; a++) {
          for (let b = 0; b <= MASK_CELL / CELL; b++) if (onRoad(rr + a, cc + b)) return "#";
        }
        return ".";
      })
      .join(""),
  )
  .map((row) => `  "${row}",`)
  .join("\n");

const hash = createHash("sha256").update(await readFile(ART)).digest("hex");

await writeFile(
  OUT,
  `/**
 * The road on the milestone artwork, traced. Generated — do not hand-edit.
 *
 *     node scripts/build-milestone-path.mjs
 *
 * \`ROAD_PATH\` runs from zero hours at the top of the picture to the last
 * milestone near the bottom, ordered, with the points evenly spaced by distance
 * *along the road* rather than by height — this road switches back on itself, so
 * height would put them in the wrong order through every hairpin.
 *
 * Because the spacing is even, the first n points of the path are exactly the
 * first n/${SAMPLES} of the journey, which is what lets the progress overlay be a
 * simple prefix of the polyline.
 *
 * See the generator for how the road is separated from the rooftops and rocks
 * that are the same colour as it.
 */

export type PathPoint = { x: number; y: number };

/** The artwork this was traced from. A different picture must regenerate. */
export const ARTWORK_SHA256 = "${hash}";

export const ROAD_MASK_CELL = ${MASK_CELL};

/** Zero hours first, last milestone last. Percentages of the artwork. */
export const ROAD_PATH: readonly PathPoint[] = ${JSON.stringify(path)
    .replace(/\},\{/g, " },\n  { ")
    .replace(/^\[\{/, "[\n  { ")
    .replace(/\}\]$/, " },\n]")
    .replace(/"(x|y)":/g, "$1: ")
    .replace(/,(x|y):/g, ", $1:")};

/** Where each threshold sits on the road, evenly spaced. */
export const MILESTONE_POINTS: readonly (PathPoint & { hours: number })[] = ${JSON.stringify(markers)
    .replace(/\},\{/g, " },\n  { ")
    .replace(/^\[\{/, "[\n  { ")
    .replace(/\}\]$/, " },\n]")
    .replace(/"(hours|x|y)":/g, "$1: ")
    .replace(/,(hours|x|y):/g, ", $1:")};

/** \`#\` road, \`.\` not. One character per ${MASK_CELL}px cell of the artwork. */
export const ROAD_MASK: readonly string[] = [
${maskRows}
];

/** True when this point on the artwork (in percent) is on the road. */
export function isOnRoad(x: number, y: number, width = ${W}, height = ${H}): boolean {
  const r = Math.floor((y / 100) * height / ROAD_MASK_CELL);
  const row = ROAD_MASK[Math.min(ROAD_MASK.length - 1, Math.max(0, r))];
  const c = Math.floor((x / 100) * width / ROAD_MASK_CELL);
  return row[Math.min(row.length - 1, Math.max(0, c))] === "#";
}
`,
  "utf8",
);

console.log(`road: ${road.size} cells, ${longest} steps end to end`);
console.log(`path: ${SAMPLES} points, y ${path[0].y.toFixed(1)}% → ${path[path.length - 1].y.toFixed(1)}%`);
console.log(`markers: ${markers.map((m) => `${m.hours}@(${m.x},${m.y})`).join("  ")}`);
console.log(`artwork sha256 ${hash.slice(0, 16)}…`);
