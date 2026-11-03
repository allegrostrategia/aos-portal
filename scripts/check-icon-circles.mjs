/**
 * The tinted discs, pills, field borders and link colours the reporting
 * pages rest on — run it, don't eyeball it.
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

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * The month in the reporting header, which is the one piece of text in
 * aOS set in a colour rather than in ink.
 *
 * The brand orange is a FILL — 2.69:1 on the reporting ground, which is
 * why a primary button is orange with ink text and not the other way
 * round. `--aos-orange-ink` is the same hue taken down until words can
 * be set in it, and the number is checked here rather than trusted,
 * against every surface in aOS so that moving the pill cannot quietly
 * fail it.
 */
console.log("\n--- the month pill: orange-ink on each surface (needs 4.5) ---");
{
  const ORANGE_INK = "#be3c07";
  const EVERY_SURFACE = {
    ...SURFACES,
    "reporting ground": "#f3f5fd",
    "cream ground": "#fbf5ea",
    "cream-deep (wells)": "#f4eee4",
  };
  for (const [label, surface] of Object.entries(EVERY_SURFACE)) {
    const c = contrast(hex(ORANGE_INK), hex(surface));
    check(c >= 4.5, `${label.padEnd(30)} ${c.toFixed(2)}:1`);
  }
}

/**
 * Every link, button and `<summary>` drawn in a share of ink.
 *
 * `text-small` is 14px and `text-caption` is 12px; WCAG counts both as normal
 * text, so they owe 4.5:1, not 3. They sit on whichever surface they land on —
 * the cool pale ground inside `/reporting`, cream everywhere else, and a card
 * of either — so all four are checked and the weakest decides.
 *
 * Here because it failed. These were ink/60, which is 4.28:1 on a cream card
 * and 4.43:1 at its best, and had been since each one was written. 1 November:
 * the Sign out link first, then the other 24 on Dom's instruction.
 */
const INTERACTIVE_ALPHA = 0.7;

console.log(
  `\n--- links, buttons and toggles: ink/${INTERACTIVE_ALPHA * 100} on every surface (needs 4.5) ---`,
);
for (const [label, ground] of Object.entries({
  "reporting ground": "#f3f5fd",
  "cream ground": "#fbf5ea",
  "white card": "#ffffff",
  "cream card": "#f9f2e6",
})) {
  const text = over(BRAND.ink, INTERACTIVE_ALPHA, ground);
  const c = contrast(text, hex(ground));
  check(c >= 4.5, `${label.padEnd(18)} ${c.toFixed(2)}:1`);
}

/**
 * …and that nothing interactive has drifted back below it.
 *
 * The arithmetic above says ink/70 passes. It cannot say that every link is
 * drawn in ink/70 — a new "Cancel" copied from an old one would be back at
 * 4.28:1 with every number here still green. So this reads the source and
 * names anything interactive still on a weaker share.
 *
 * Matched on the line, which is how these are written: the class list and the
 * tag are on the same line, or the class list carries `underline` itself.
 */
console.log("\n--- …and nothing interactive is drawn weaker than that ---");
{
  const WEAK = /text-ink\/(?:[0-5]?\d|6[0-9])\b/;
  const INTERACTIVE = /underline|<button|<summary|cursor-pointer|<a |<Link/;
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) {
        readFileSync(full, "utf8").split("\n").forEach((line, i) => {
          if (WEAK.test(line) && INTERACTIVE.test(line)) offenders.push(`${full}:${i + 1}`);
        });
      }
    }
  };
  walk("src");

  check(offenders.length === 0, offenders.length === 0
    ? "every interactive element is ink/70 or stronger"
    : `${offenders.length}: ${offenders.slice(0, 5).join(", ")}${offenders.length > 5 ? " …" : ""}`);
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
