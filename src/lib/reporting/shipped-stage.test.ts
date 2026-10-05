import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

/**
 * The preview override cannot reach a client.
 *
 * `NEXT_PUBLIC_REPORTING_STAGE` exists so a finished Stage 3 tab can be
 * looked at on localhost before it is shipped to everybody. That is a
 * useful thing and a dangerous one: the same variable set in Vercel would
 * put unfinished screens in front of real clients, and `NEXT_PUBLIC_`
 * variables are inlined at build time, so it would stay there until
 * somebody noticed and redeployed.
 *
 * A source check rather than a behaviour test, because the thing being
 * asserted is structural: the override must be behind `NODE_ENV ===
 * "development"`, which `next build` sets and no environment variable can
 * override. Mutating the guard away fails this.
 */

const root = new URL("../../../", import.meta.url).pathname;

test("the stage override is development-only", async () => {
  const source = await readFile(`${root}src/lib/reporting/categories.ts`, "utf8");

  const line = source
    .split("\n")
    .find((l) => l.includes("NEXT_PUBLIC_REPORTING_STAGE"));
  assert.ok(line, "the override is gone — delete this test too, or restore it");

  const gate = source.slice(
    source.indexOf("export const SHIPPED_STAGE"),
    source.indexOf("export const SHIPPED_CATEGORIES"),
  );
  assert.match(
    gate,
    /process\.env\.NODE_ENV === "development"/,
    "the override must be behind NODE_ENV, or Vercel could turn on unfinished tabs",
  );
  assert.match(gate, /PRODUCTION_STAGE/, "and production must fall back to the constant");
});

test("production ships stage 2 and nothing more", async () => {
  // The number a reader of this repo should be able to trust. Raising it is
  // a deliberate edit, reviewed, not a configuration change.
  const source = await readFile(`${root}src/lib/reporting/categories.ts`, "utf8");
  assert.match(source, /const PRODUCTION_STAGE = 2;/);
});
