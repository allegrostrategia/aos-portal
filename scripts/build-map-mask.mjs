/**
 * Regenerates the La Strada land mask from the artwork.
 *
 * Run this whenever `public/illustrations/la-strada-map.png` changes:
 *
 *     node scripts/build-map-mask.mjs
 *
 * The test that consumes the mask checks the artwork's hash, so a changed
 * picture fails loudly rather than silently validating positions against a
 * coastline that has moved.
 *
 * **Why a committed mask rather than sampling colours in the test.** The
 * obvious version of this test samples the pixels under each marker and calls
 * anything blue "sea". That does not work on this picture, and the numbers say
 * so: the shadowed asphalt on the harbour road reads R25 G34 B35, which is the
 * same signature as dark water. Ranked by any colour rule — blue dominance,
 * saturation, channel ratios — the *correctly placed* Grand Hotel marker scores
 * more sea-like than parts of the actual sea. Texture doesn't separate them
 * either, because the marina is full of boats.
 *
 * What does separate them is connectivity: the sea is one region that reaches
 * the edge of the picture, and a dark road in the middle of town is not. So the
 * colour rule only proposes candidates, and a flood fill from the border decides
 * which of them are really water. On this artwork that reclaims the fountain and
 * seven other shaded patches that every colour rule called sea.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ART = fileURLToPath(new URL("../public/illustrations/la-strada-map.png", import.meta.url));
const OUT = fileURLToPath(new URL("../src/lib/map/land-mask.ts", import.meta.url));

/** 32px cells — 2% of the width, finer than any marker is big. */
const CELL = 32;
/** A cell is a water *candidate* when this much of it is water-coloured. */
const CANDIDATE = 0.45;

const { data, info } = await sharp(ART).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const COLS = Math.ceil(W / CELL);
const ROWS = Math.ceil(H / CELL);

// Water in this picture is teal: red is strongly suppressed against both other
// channels. Deliberately permissive — the flood fill below is what makes the
// call, and a candidate that isn't connected to the sea costs nothing.
const candidate = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let total = 0;
    let teal = 0;
    for (let y = r * CELL; y < Math.min(H, (r + 1) * CELL); y++) {
      for (let x = c * CELL; x < Math.min(W, (c + 1) * CELL); x++) {
        const i = (y * W + x) * C;
        const R = data[i];
        const G = data[i + 1];
        const B = data[i + 2];
        total++;
        if (G > R * 1.45 && B > R * 1.45) teal++;
      }
    }
    row.push(teal / total > CANDIDATE);
  }
  candidate.push(row);
}

// Only water that reaches the edge of the picture is sea.
const sea = candidate.map((row) => row.map(() => false));
const queue = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const onBorder = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
    if (onBorder && candidate[r][c]) {
      sea[r][c] = true;
      queue.push([r, c]);
    }
  }
}
while (queue.length) {
  const [r, c] = queue.pop();
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
    if (sea[nr][nc] || !candidate[nr][nc]) continue;
    sea[nr][nc] = true;
    queue.push([nr, nc]);
  }
}

const reclaimed = candidate.flat().filter(Boolean).length - sea.flat().filter(Boolean).length;
const hash = createHash("sha256").update(await readFile(ART)).digest("hex");
const rows = sea.map((row) => `  "${row.map((s) => (s ? "~" : "#")).join("")}",`).join("\n");

await writeFile(
  OUT,
  `/**
 * Where the water is on the La Strada artwork. Generated — do not hand-edit.
 *
 *     node scripts/build-map-mask.mjs
 *
 * One character per ${CELL}px cell of \`la-strada-map.png\`: \`~\` sea, \`#\` land.
 * Squint and the shape of the town is visible in it, which is the point — this
 * is the ground truth a marker position gets checked against, so it should be
 * possible to see that it is right.
 *
 * See the generator for why this is a committed mask rather than a colour test
 * run at test time. Short version: shadowed asphalt and dark water are the same
 * colour, and only connectivity to the picture's edge tells them apart.
 */

/** The artwork this was generated from. A different picture must regenerate. */
export const ARTWORK_SHA256 = "${hash}";

export const MASK_CELL = ${CELL};

export const LAND_MASK: readonly string[] = [
${rows}
];

/** True when this point on the artwork (in percent) is open water. */
export function isSea(x: number, y: number, width = ${W}, height = ${H}): boolean {
  const row = LAND_MASK[Math.min(LAND_MASK.length - 1, Math.max(0, Math.floor((y / 100) * height / MASK_CELL)))];
  const col = Math.min(row.length - 1, Math.max(0, Math.floor((x / 100) * width / MASK_CELL)));
  return row[col] === "~";
}

/** How much of an axis-aligned box on the artwork is open water, 0–1. */
export function seaFraction(x: number, y: number, w: number, h: number): number {
  let total = 0;
  let wet = 0;
  for (let dy = -h / 2; dy <= h / 2; dy += 0.5) {
    for (let dx = -w / 2; dx <= w / 2; dx += 0.5) {
      total++;
      if (isSea(x + dx, y + dy)) wet++;
    }
  }
  return total === 0 ? 0 : wet / total;
}
`,
  "utf8",
);

console.log(`${COLS}x${ROWS} cells, ${sea.flat().filter(Boolean).length} sea, ${reclaimed} reclaimed by the flood fill`);
console.log(`artwork sha256 ${hash.slice(0, 16)}…`);
