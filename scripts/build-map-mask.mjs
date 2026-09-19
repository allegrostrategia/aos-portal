/**
 * Regenerates a land mask for one of The Map's two artworks.
 *
 *     node scripts/build-map-mask.mjs landscape
 *     node scripts/build-map-mask.mjs portrait
 *
 * Run whenever the corresponding `public/illustrations/the-map-*.jpg` changes.
 * The test that consumes a mask checks the artwork's hash, so a changed
 * picture fails loudly rather than silently validating positions against a
 * coastline that has moved.
 *
 * **Why a committed mask rather than sampling colours in the test.** The
 * obvious version of this test samples the pixels under each marker and calls
 * anything blue "sea". That does not work on these pictures, and the numbers
 * said so on the first one: the shadowed asphalt on the harbour road reads
 * R25 G34 B35, the same signature as dark water. Ranked by any colour rule, a
 * correctly placed harbour marker scores more sea-like than parts of the
 * actual sea. Texture doesn't separate them either; the marina is full of
 * boats.
 *
 * What does separate them is connectivity: the sea is one region that reaches
 * the edge of the picture, and a dark road in the middle of town is not. So
 * the colour rule only proposes candidates, and a flood fill from the border
 * decides which of them are really water.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const key = process.argv[2];
if (key !== "landscape" && key !== "portrait") {
  console.error("usage: node scripts/build-map-mask.mjs landscape|portrait");
  process.exit(1);
}
const FILE = `the-map-${key}.jpg`;
const ART = fileURLToPath(new URL(`../public/illustrations/${FILE}`, import.meta.url));
const OUT = fileURLToPath(new URL(`../src/lib/map/masks/${key}.ts`, import.meta.url));

const CELL = 32;
const CANDIDATE = 0.45;

const { data, info } = await sharp(ART).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const COLS = Math.ceil(W / CELL);
const ROWS = Math.ceil(H / CELL);

// Water in these pictures runs from deep blue to a pale haze at the horizon
// (R131 G165 B192 on the portrait's top edge), so the rule is blue dominance
// rather than a ratio: blue clearly above red, and above green, with green
// above red so violet umbrellas don't count. Terracotta, whitewash, trees,
// stone and shadowed road all fail it. Deliberately permissive otherwise; the
// flood fill below is what makes the call, and a candidate that isn't
// connected to the sea costs nothing.
const candidate = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let total = 0;
    let blue = 0;
    for (let y = r * CELL; y < Math.min(H, (r + 1) * CELL); y++) {
      for (let x = c * CELL; x < Math.min(W, (c + 1) * CELL); x++) {
        const i = (y * W + x) * C;
        const R = data[i];
        const G = data[i + 1];
        const B = data[i + 2];
        total++;
        if (B > R + 25 && B >= G && G > R) blue++;
      }
    }
    row.push(blue / total > CANDIDATE);
  }
  candidate.push(row);
}

// Only water that reaches the edge of the picture is sea. And only where it
// reaches the edge in a run of three or more cells: the sea meets the edge
// along whole stretches, whereas a dark blue awning at the edge (the third
// portrait's Grand Hotel Riposo, RGB 57/105/151 against the sea's 50/120/154,
// which no colour rule tells apart) touches it in one.
const MIN_RUN = 3;
const sea = candidate.map((row) => row.map(() => false));
const queue = [];
const border = [];
for (let c = 0; c < COLS; c++) border.push([0, c]);
for (let r = 1; r < ROWS; r++) border.push([r, COLS - 1]);
for (let c = COLS - 2; c >= 0; c--) border.push([ROWS - 1, c]);
for (let r = ROWS - 2; r > 0; r--) border.push([r, 0]);
for (let i = 0; i < border.length; i++) {
  const [r, c] = border[i];
  if (!candidate[r][c]) continue;
  // Any run of MIN_RUN candidate border cells through this one seeds it.
  let longest = 0, cur = 0;
  for (let k = -MIN_RUN + 1; k < MIN_RUN; k++) {
    const [rr, cc] = border[(i + k + border.length) % border.length];
    cur = candidate[rr][cc] ? cur + 1 : 0;
    longest = Math.max(longest, cur);
  }
  if (longest >= MIN_RUN) {
    sea[r][c] = true;
    queue.push([r, c]);
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
const rows = sea.map((row) => `    "${row.map((s) => (s ? "~" : "#")).join("")}",`).join("\n");

await writeFile(
  OUT,
  `import type { LandMask } from "../land-mask.ts";

/**
 * Where the water is on The Map's ${key} artwork. Generated — do not hand-edit.
 *
 *     node scripts/build-map-mask.mjs ${key}
 *
 * One character per ${CELL}px cell of \`${FILE}\`: \`~\` sea, \`#\` land. Squint
 * and the shape of the town is visible in it, which is the point — this is
 * the ground truth a marker position gets checked against, so it should be
 * possible to see that it is right.
 */
export const ${key.toUpperCase()}_MASK: LandMask = {
  /** The artwork this was generated from. A different picture must regenerate. */
  sha256: "${hash}",
  file: "${FILE}",
  cell: ${CELL},
  width: ${W},
  height: ${H},
  rows: [
${rows}
  ],
};
`,
);

console.log(`${FILE}: ${COLS}×${ROWS} cells, ${sea.flat().filter(Boolean).length} sea, ${reclaimed} candidates reclaimed as land`);
