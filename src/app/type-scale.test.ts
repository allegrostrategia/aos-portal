import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `text-<name>` size class in the app is one `globals.css` defines.
 *
 * Tailwind v4 has no config file and no error for a class it does not
 * know: `text-h3` compiles to nothing at all, so the element simply
 * inherits, and it looks almost right — a 22px serif heading rendering at
 * 16px is still a serif heading. It sat in five places across two
 * components for a month and was found by measuring a card in the browser,
 * which is not a way of finding the other four.
 *
 * So this reads the type scale out of `globals.css` and checks every
 * `text-…` in the source against it, allowing the colours and the
 * alignment utilities by name. A new size has to be defined before it can
 * be used, which is the right way round.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");

/** The scale: `--text-heading: …`, ignoring its `--line-height` siblings. */
const SIZES = new Set(
  [...CSS.matchAll(/^\s*--text-([a-z0-9-]+):/gm)]
    .map((m) => m[1])
    .filter((name) => !name.includes("--")),
);

/**
 * The brand colours, from the same file, so `text-ink` and `text-orange`
 * are not mistaken for sizes. `--color-x` is what Tailwind reads for a
 * colour utility.
 */
const COLOURS = new Set(
  [...CSS.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1]),
);

/** Tailwind's own `text-…` utilities, which are not ours to define. */
const BUILT_IN = new Set([
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  "white",
  "black",
  "transparent",
  "current",
  "inherit",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

test("the type scale actually parsed", () => {
  // Without this the test below passes by having nothing to check against
  // — and would then accept every class in the app.
  assert.ok(SIZES.has("heading"), [...SIZES].join(", "));
  assert.ok(SIZES.has("caption"));
  assert.ok(COLOURS.has("ink"));
});

test("no component uses a text- class nothing defines", () => {
  const unknown = new Map<string, string[]>();

  for (const file of sourceFiles("src")) {
    // Comments out first. This codebase explains itself at length, and
    // "a real text-search index" is prose, not a utility — stripping is
    // cheaper and less brittle than trying to recognise a class list.
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // Inside a class string only: `text-` in prose or in a variable name
    // is not a utility. Arbitrary values (`text-[0.7rem]`) are explicit
    // and need no token.
    for (const match of source.matchAll(/(?:^|[\s"'`:])(?:[a-z0-9]+:)*text-([a-z0-9-]+)/g)) {
      const name = match[1];
      if (SIZES.has(name) || COLOURS.has(name) || BUILT_IN.has(name)) continue;
      // `text-ink/75` and `text-deep-red` arrive here with the slash
      // already stripped by the pattern; a colour with a hyphen is still
      // a colour.
      if ([...COLOURS].some((c) => name === c || name.startsWith(`${c}-`))) continue;
      unknown.set(name, [...(unknown.get(name) ?? []), file]);
    }
  }

  assert.deepEqual(
    [...unknown].map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`),
    [],
    "a text- class with no token behind it renders as nothing",
  );
});
