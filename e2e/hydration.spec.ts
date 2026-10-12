import { expect, test } from "@playwright/test";

import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * The guard for the thing that made this suite green for weeks while
 * the app it was testing never ran any JavaScript.
 *
 * Next's dev server was answering **403 to its own chunks**: Playwright
 * drives `127.0.0.1`, Next decided its origin was `localhost`, and
 * every chunk request looked cross-origin. The pages rendered, nothing
 * hydrated, and no test noticed — because a click that fell through to
 * a native form post looks exactly like a click that worked, only
 * synchronous. Three controls were diagnosed as React problems and
 * rewritten because of it.
 *
 * Two checks, because either alone would have missed it:
 *
 *   · **No script or stylesheet may answer 4xx or 5xx.** This is the
 *     direct symptom, and it is the one that would have named the cause
 *     in a line rather than after a day.
 *   · **A control that cannot work without JavaScript must work.** The
 *     symptom could come back wearing different clothes — a chunk that
 *     200s and throws, a bundler change, a CSP — and the only thing
 *     that proves hydration is something hydrating.
 */

requireLocalStack();

/** Collects every response that should never fail. */
function watchAssets(page: import("@playwright/test").Page) {
  const bad: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    const type = response.request().resourceType();
    if ((type === "script" || type === "stylesheet") && response.status() >= 400) {
      bad.push(`${response.status()} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });
  return bad;
}

test("no script or stylesheet on a signed-in screen answers 4xx", async ({ page }) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  const bad = watchAssets(page);

  await signIn(page, "nina");
  for (const path of [
    "/piazza",
    "/you",
    `/reporting?month=${MONTHS.sep}`,
    `/reporting/enter/client-experience?month=${MONTHS.sep}`,
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  expect(bad, `assets refused:\n${bad.join("\n")}`).toEqual([]);
});

test("a control that needs JavaScript actually works", async ({ page }) => {
  // Financials' live card — the one headed "these update as you type" —
  // recalculates in the browser with no save and no navigation.
  //
  // Financials rather than Client Experience, which was the first
  // choice and proved nothing: its figures hang off an opening number
  // that is not set in September, so they are dashes either way and the
  // card cannot move whether the page is hydrated or not. A probe that
  // cannot fail is how this whole problem lasted as long as it did.
  const { MONTHS, seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  const before = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await page.getByLabel(/fixed costs/i).fill("1234");
  // No save, no navigation: anything that changes now changed in the
  // browser.
  await expect
    .poll(
      async () => (await page.locator("main").innerText()).replace(/\s+/g, " "),
      { message: "the live card never moved, so nothing is hydrated" },
    )
    .not.toBe(before);
});
