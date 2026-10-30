/**
 * Is a chart palette safe to use? Run it; don't reason about it.
 *
 *   node scripts/check-chart-palette.mjs                        # the default, on cream
 *   node scripts/check-chart-palette.mjs navy,orange,sky        # a candidate
 *   node scripts/check-chart-palette.mjs <order> white          # on the reporting card
 *
 * Computed, never eyeballed: OKLab separation for every adjacent pair and
 * for the worst pair anywhere in the set, under normal vision and under
 * simulated deuteranopia and protanopia (Viénot 1999 single-plane
 * projections through LMS), plus contrast against the cream card the marks
 * sit on and against ink for a label placed on a fill.
 *
 * Thresholds: a CVD separation of 8 is the target and 6 a floor that is only
 * legal alongside a second encoding; a normal-vision separation below 15 is
 * a hard fail, because full-colour readers cannot tell the pair apart
 * either. A mark needs 3:1 against its surface to read as a shape at all.
 *
 * **Why this exists.** On 5 October the brand palette was checked for the
 * first time before drawing anything with it, and two pairs failed: blush
 * and lemon separate by 0.5 under protanopia — indistinguishable — and
 * 13.1 under normal vision, and gold/blush fails the normal-vision floor at
 * 13.8. Both would have looked perfectly pleasant on screen to whoever drew
 * them. Add a series colour, run this, and read the numbers.
 */

const hex = (h) => {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h) => hex(h).map(toLinear);

// sRGB(linear) → OKLab
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dE = (a, b) => {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
};

// Linear sRGB → LMS (Hunt-Pointer-Estevez via XYZ), simulate, and back.
const RGB_TO_LMS = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];
const LMS_TO_RGB = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];
const mul = (m, v) => m.map((row) => row.reduce((a, k, i) => a + k * v[i], 0));

// Viénot 1999 single-plane projections.
const DEUTER = [[1, 0, 0], [0.49421, 0, 1.24827], [0, 0, 1]];
const PROTAN = [[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]];

function simulate(rgbLinear, plane) {
  const lms = mul(RGB_TO_LMS, rgbLinear);
  const out = mul(plane, lms);
  return mul(LMS_TO_RGB, out).map((c) => Math.min(1, Math.max(0, c)));
}

// WCAG relative luminance, for the contrast figure.
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a, b) => {
  const [x, y] = [lum(a) + 0.05, lum(b) + 0.05].sort((p, q) => q - p);
  return x / y;
};

const BRAND = {
  navy: "#073c8c",
  orange: "#ff6625",
  gold: "#ffd551",
  sky: "#a4d3eb",
  blush: "#ffb29e",
  lemon: "#f8e6a0",
  charcoal: "#1b1920",
  // The line inks (30 October 2026). A 2px stroke has no edge to fall back
  // on, so it owes the reader the full 3:1 on its own — and at full strength
  // only navy clears it (orange 2.93, blush 1.73, sky 1.60, gold 1.41 on
  // white). These two are the brand hues mixed towards ink in OKLab until
  // they do: orange needs 10%, sky 35%. Gold and blush are not here on
  // purpose — a dark yellow is olive and a dark coral is mauve, so neither
  // survives the darkening as itself. Lines use these three; FILLS keep the
  // five at full strength, because a bar is a large shape with a hairline
  // round it and a line is not.
  "orange-ink": "#e56135",
  "sky-ink": "#688fb0",
};
const INK = "#0a1e4a";

/**
 * The surface the marks sit on, which the contrast check needs and which is
 * no longer one colour.
 *
 * Two of them since 30 October 2026: L'Editoriale's cream card everywhere,
 * and a white card on `/reporting`, which is Nina's scoped exception. A pale
 * fill's contrast depends on what is behind it, so the surface is an argument
 * rather than a constant — checking the reporting palette against cream would
 * answer a question nobody is asking.
 *
 *   node scripts/check-chart-palette.mjs                      # cream, the default
 *   node scripts/check-chart-palette.mjs <order> white        # the reporting card
 *   node scripts/check-chart-palette.mjs <order> '#f3f5fd'    # or any hex
 */
const SURFACES = {
  cream: "#f9f2e6",
  white: "#ffffff",
  ground: "#f3f5fd",
};

// The order the charts actually use. Changing it means re-running this.
const DEFAULT = ["orange", "gold", "sky", "blush", "navy"];

/**
 * `--lines` checks a set meant for 2px strokes and dots rather than fills.
 *
 * The only difference is that falling under 3:1 is fatal instead of a
 * warning. A pale FILL can be rescued by an edge and a legend, which is
 * what the WARN path asks for; a pale LINE cannot, because the edge would
 * be the line.
 *
 *   node scripts/check-chart-palette.mjs orange-ink,navy white --lines
 */
const LINES = process.argv.includes("--lines");
// An empty first argument means "the default order, on the surface named
// next" — otherwise `… "" white` would check a palette of nothing.
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const order = positional[0] ? positional[0].split(",") : DEFAULT;

const surfaceArg = positional[1] ?? "cream";
const CARD = SURFACES[surfaceArg] ?? surfaceArg;
if (!/^#[0-9a-f]{6}$/i.test(CARD)) {
  console.error(
    `Unknown surface "${surfaceArg}". Use ${Object.keys(SURFACES).join(", ")} or a #rrggbb hex.`,
  );
  process.exit(1);
}

const surfaceName = SURFACES[surfaceArg] ? `${surfaceArg} ${CARD}` : CARD;
console.log(`order: ${order.join(" → ")}\nsurface: card ${surfaceName}\n`);
console.log(
  LINES
    ? "contrast against the card (a 2px stroke must clear 3:1 unaided):"
    : "contrast against the card (a mark needs ≥ 3:1 to read as a shape):",
);
let fails = 0;
let warns = 0;
for (const name of order) {
  const c = contrast(lin(BRAND[name]), lin(CARD));
  const ok = c >= 3;
  // A WARN here is survivable and a FAIL is not: a pale fill needs an edge
  // and a labelled legend, which the chart components give it. It is not
  // dismissable, and it is not the same as two colours nobody can tell
  // apart.
  if (!ok) {
    if (LINES) fails++;
    else warns++;
  }
  console.log(`  ${ok ? "ok  " : LINES ? "FAIL" : "WARN"} ${name.padEnd(9)} ${c.toFixed(2)}:1`);
}

console.log("\nadjacent pairs — normal vision (≥15), deuteranopia and protanopia (≥8):");
for (let i = 0; i < order.length - 1; i++) {
  const [a, b] = [order[i], order[i + 1]];
  const la = lin(BRAND[a]), lb = lin(BRAND[b]);
  const normal = dE(la, lb);
  const deut = dE(simulate(la, DEUTER), simulate(lb, DEUTER));
  const prot = dE(simulate(la, PROTAN), simulate(lb, PROTAN));
  const worst = Math.min(deut, prot);
  const ok = normal >= 15 && worst >= 8;
  const floor = normal >= 15 && worst >= 6;
  if (!ok) fails++;
  console.log(
    `  ${ok ? "ok  " : floor ? "FLOOR" : "FAIL"} ${a}/${b}`.padEnd(26) +
      `normal ${normal.toFixed(1)}  deut ${deut.toFixed(1)}  prot ${prot.toFixed(1)}`,
  );
}

console.log("\nevery pair, worst CVD separation (a donut puts any two slices side by side):");
const names = order;
let worstPair = null;
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const la = lin(BRAND[names[i]]), lb = lin(BRAND[names[j]]);
    const worst = Math.min(
      dE(simulate(la, DEUTER), simulate(lb, DEUTER)),
      dE(simulate(la, PROTAN), simulate(lb, PROTAN)),
    );
    if (!worstPair || worst < worstPair.worst) worstPair = { pair: `${names[i]}/${names[j]}`, worst, normal: dE(la, lb) };
  }
}
console.log(
  `  worst is ${worstPair.pair}: CVD ${worstPair.worst.toFixed(1)}, normal ${worstPair.normal.toFixed(1)}`,
);

console.log(`\nink on these (a label sitting on a slice), contrast vs ${INK}:`);
for (const name of order) {
  const c = contrast(lin(BRAND[name]), lin(INK));
  console.log(`  ${c >= 4.5 ? "ok  " : c >= 3 ? "large only" : "no  "} ${name.padEnd(7)} ${c.toFixed(2)}:1`);
}

if (fails > 0) {
  console.log(`\n${fails} FAIL(s) — do not draw with this set. Re-step it.`);
} else if (warns > 0) {
  console.log(
    `\nPASS with ${warns} low-contrast fill(s).` +
      "\nEach one owes the reader an edge (a 2px cream separator and a hairline" +
      "\nink outline) and a labelled legend, which the chart components provide." +
      "\nThat obligation is not optional and not satisfied by colour alone.",
  );
} else {
  console.log("\nPASS");
}
process.exitCode = fails > 0 ? 1 : 0;
