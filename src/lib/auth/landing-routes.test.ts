import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

/**
 * No auth step may send somebody to a fixed screen.
 *
 * `landingPath()` has tests, but nothing checked that the places which
 * finish an authentication actually CALL it — and on 2 October `setPassword`
 * still redirected to /piazza, so a retainer client's first ever sign-in,
 * immediately after choosing their password, landed on "Your account isn't
 * ready yet". Mutating that line back failed no test at all.
 *
 * A source check rather than an action test because the point is structural:
 * there must be one decider, and these are the four doors into it.
 */

const DOORS = [
  "src/lib/auth/actions.ts",
  "src/app/auth/confirm/route.ts",
  "src/app/(auth)/login/page.tsx",
  "src/proxy.ts",
];

const root = new URL("../../../", import.meta.url).pathname;

test("nothing that completes a sign-in hardcodes a destination", async () => {
  const offenders: string[] = [];

  for (const file of DOORS) {
    const source = await readFile(root + file, "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      // revalidatePath names a path to refresh, which is not a destination.
      if (line.includes("revalidatePath")) continue;
      if (/["'`]\/piazza["'`]/.test(line)) {
        offenders.push(`${file}:${index + 1} ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these send somebody to /piazza directly; send them to "/" and let the root page decide',
  );
});

test("the doors examined are the ones that still exist", async () => {
  // A renamed file would make the test above pass by looking at nothing.
  for (const file of DOORS) {
    const source = await readFile(root + file, "utf8").catch(() => null);
    assert.ok(source, `${file} is gone — update this list`);
    assert.ok(
      source.includes("redirect") || source.includes("next"),
      `${file} no longer decides where anyone goes — update this list`,
    );
  }
});
