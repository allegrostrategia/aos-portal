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

test("the shipped stage is a reviewed constant, not a configuration change", async () => {
  // The number a reader of this repo should be able to trust. Raising it is
  // a deliberate edit, reviewed, not a configuration change.
  //
  // **It was 2 until 14 November**, when it went to 6 so Nina could see
  // the report pages at all — five of the eleven had no route below
  // stage 4. That was safe only because the email audit came first and
  // found nobody to send to; the check that matters now lives in the
  // test below, and it holds at any stage.
  const source = await readFile(`${root}src/lib/reporting/categories.ts`, "utf8");
  const production = /const PRODUCTION_STAGE = (\d+);/.exec(source);
  assert.ok(production, "PRODUCTION_STAGE is gone");
  assert.ok(
    Number(production[1]) >= 2 && Number(production[1]) <= 6,
    `PRODUCTION_STAGE is ${production[1]}, which is not a stage`,
  );
});

test("production is below Stage 5, so the reminder job sends nothing from live", async () => {
  // Stage 5 is the first stage that reaches outside the app: a job that
  // puts email in a real inbox, and `dom` has had a real member
  // workspace on live since 9 October. The job asks `SHIPPED_STAGE`,
  // so what that constant is in production is the whole guarantee.
  //
  // A source check for the same reason as the one above — the harness
  // runs the job at Stage 5 on purpose, so it cannot also be the thing
  // that proves the default.
  const source = await readFile(`${root}src/lib/reporting/categories.ts`, "utf8");

  const production = /const PRODUCTION_STAGE = (\d+);/.exec(source);
  assert.ok(production, "PRODUCTION_STAGE is gone");

  const gate = source.slice(source.indexOf("export const STAGE_5"));
  assert.match(gate, /SHIPPED_STAGE >= 5/, "STAGE_5 must read the shipped stage, nothing else");

  if (Number(production[1]) < 5) return;

  /**
   * **Stage 5 is on, so the other lock has to be there.**
   *
   * A branch may raise the stage to look at unfinished pages, and a
   * Vercel preview of that branch points at the same live database —
   * so the reminder job would plan from real workspaces and send real
   * email. Below Stage 5 the job returns 0 and none of this matters;
   * at or above it, the cron entry point must refuse any deployment
   * that is not production. Weakened to a warning the day somebody
   * raises the stage, this test would be worth nothing, so it is the
   * raise itself that turns the requirement on.
   */
  const cron = await readFile(`${root}src/app/api/cron/due-jobs/route.ts`, "utf8");
  assert.match(
    cron,
    /VERCEL_ENV/,
    "PRODUCTION_STAGE >= 5 and the cron does not check which deployment it is",
  );
  assert.match(
    cron,
    /deployment !== "production"/,
    "the cron must refuse every deployment that is not production",
  );
});
