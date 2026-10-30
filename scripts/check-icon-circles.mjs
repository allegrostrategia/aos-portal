/**
 * The tinted discs, pills and field borders the reporting pages added on
 * 30 October — run it, don't eyeball it.
 *
 *   node scripts/check-icon-circles.mjs
 *
 * These are not series colours, so `check-chart-palette.mjs` has nothing to
 * say about them: they are translucent tints laid over a card, with ink
 * drawn on top. What matters is what the ink ends up sitting on, and that
 * depends on the card — white on `/reporting`, cream everywhere else — so
 * each one is composited over both and checked twice.
 *
 * Thresholds, from WCAG:
 *   4.5:1  text on its background (the icon glyph, the pill's label)
 *   3:1    a non-text boundary that has a job — a field's border is the
 *          only thing saying "type here" once the fill is white
 */

const hex = (h) => {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

/** `color-mix`/alpha over a surface: what the eye actually receives. */
const over = (fg, alpha, bg) => hex(fg).map((c, i) => c * alpha + hex(bg)[i] * (1 - alpha));

const BRAND = {
  navy: "#073c8c",
  orange: "#ff6625",
  gold: "#ffd551",
  sky: "#a4d3eb",
  blush: "#ffb29e",
  lemon: "#f8e6a0",
  ink: "#0a1e4a",
};

const SURFACES = { "white card (/reporting)": "#ffffff", "cream card (everywhere else)": "#f9f2e6" };

/** Tint, alpha — as `TONE_BG` in `components/reporting/icons.tsx` sets them. */
const TINTS = [
  ["gold", 0.9],
  ["blush", 0.85],
  ["sky", 0.85],
  ["orange", 0.5],
];

let fails = 0;
const check = (ok, line) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${line}`);
};

for (const [label, surface] of Object.entries(SURFACES)) {
  console.log(`\n--- icon circles on the ${label}: ink glyph on the tint (needs 4.5) ---`);
  for (const [name, alpha] of TINTS) {
    const disc = over(BRAND[name], alpha, surface);
    const c = contrast(hex(BRAND.ink), disc);
    check(c >= 4.5, `${name.padEnd(7)} @${alpha}  ink ${c.toFixed(2)}:1`);
  }

  // The disc also has to be a disc. There is no WCAG number for "a tinted
  // circle behind an icon", and these hues have hard ceilings against a
  // white card — gold 1.41:1 and lemon 1.25:1 at FULL strength, because
  // they are pale by nature. So this reports the figure and flags anything
  // under 1.3, which is the point where the disc stops reading as a shape
  // at a glance. The glyph inside is 10:1 either way.
  console.log(`--- …and the disc has to read as a disc (1.3 is the practical floor) ---`);
  for (const [name, alpha] of TINTS) {
    const disc = over(BRAND[name], alpha, surface);
    const c = contrast(disc, hex(surface));
    // A tint is decoration around an icon that is itself high-contrast, so
    // this one is advisory: the glyph carries the shape either way.
    console.log(`  ${c >= 1.3 ? "ok  " : "thin"} ${name.padEnd(7)} @${alpha}  vs card ${c.toFixed(2)}:1`);
  }
}

console.log("\n--- the Focus area tag: ink/75 on blush/60 (needs 4.5) ---");
for (const [label, surface] of Object.entries(SURFACES)) {
  const pill = over(BRAND.blush, 0.6, surface);
  const text = over(BRAND.ink, 0.75, `#${pill.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`);
  check(contrast(text, pill) >= 4.5, `${label.padEnd(30)} ${contrast(text, pill).toFixed(2)}:1`);
}

console.log("\n--- reporting field borders: ink/50 on white (needs 3) ---");
{
  const border = over(BRAND.ink, 0.5, "#ffffff");
  const c = contrast(border, hex("#ffffff"));
  check(c >= 3, `border ${c.toFixed(2)}:1 against the field's own white fill`);
}

console.log(
  fails === 0
    ? "\nPASS — every tint keeps its glyph and its label legible."
    : `\n${fails} FAIL(s) — re-pick the alpha, not the threshold.`,
);
process.exit(fails ? 1 : 0);
