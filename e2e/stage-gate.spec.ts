import { expect, test } from "@playwright/test";

import { STAGE_2_PORT } from "../playwright.config.ts";
import { MONTHS, PEOPLE } from "./guard.ts";
import { requireLocalStack } from "./helpers.ts";

/**
 * Stage 3 is invisible at the stage production is on.
 *
 * The four new tabs hide by having no route, which is easy to believe.
 * The Overview is different: it is a screen a client opens today, and
 * Stage 3 added three things to it. "It is behind the flag" is a claim
 * about code until somebody watches it not happen, so this runs the
 * same app on a second server with the flag where production has it,
 * and looks.
 *
 * Dom's condition, 6 October: pushing Stage 3 must change nothing a
 * client sees.
 */

requireLocalStack();

const STAGE_2 = `http://127.0.0.1:${STAGE_2_PORT}`;

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

/** Sign in on the stage-2 server, which is not the one baseURL points at. */
async function signInAtStage2(page: import("@playwright/test").Page, who: keyof typeof PEOPLE) {
  const person = PEOPLE[who];
  await page.context().clearCookies();
  await page.goto(`${STAGE_2}/login`);
  await page.getByLabel(/email/i).fill(person.email);
  await page.getByLabel(/password/i).fill(person.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("the Overview carries none of Stage 3 at the production flag", async ({ page }) => {
  // A target is set first, so the bar would have something to draw if
  // the gate were not there. Set through the stage-3 server, because at
  // stage 2 the page it is set on does not exist.
  await page.goto("/login");
  const { signIn } = await import("./helpers.ts");
  await signIn(page, "nina");
  await page.goto(`/reporting/targets?month=${MONTHS.sep}`);
  await page.locator("#target-leads_conversions_new_clients").fill("10");
  await page.getByRole("button", { name: /save targets/i }).click();
  await expect(page.getByText(/1 target saved/i)).toBeVisible();

  // The same month, the same data, the production flag.
  await signInAtStage2(page, "nina");
  await page.goto(`${STAGE_2}/reporting?month=${MONTHS.sep}`);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  expect(text).not.toMatch(/Look at these first/);
  expect(text).not.toMatch(/What went WELL this month/);
  expect(text).not.toMatch(/How this month is going/);
  expect(text).not.toMatch(/No targets set/);
  expect(text).not.toMatch(/(On track|Close|Off track) vs\./);

  // And the screen is still itself: the Stage 2 Overview, intact.
  expect(text).toMatch(/NEW LEADS/);
  expect(text).toMatch(/Notes from your strategist/);
  expect(text).toMatch(/Ready to publish\?/);
});

test("the same Overview at stage 3 has all of it, so the test above means something", async ({
  page,
}) => {
  const { signIn } = await import("./helpers.ts");
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  expect(text).toMatch(/Look at these first/);
  expect(text).toMatch(/(On track|Close|Off track) vs\./);
});

test("Stage 3's own pages and tabs have no route at the production flag", async ({ page }) => {
  await signInAtStage2(page, "nina");

  for (const path of [
    "/reporting/targets",
    "/reporting/benchmarks",
    "/reporting/ads",
    "/reporting/funnels",
    "/reporting/trial-reels",
    "/reporting/client-experience",
    "/reporting/enter/ads",
    // Stage 4. The Launches TAB hides itself, because `categoryBySlug`
    // refuses a category ahead of the build — but the module's own pages
    // are not categories and have no such cover, so each asks `STAGE_4`.
    "/reporting/launches",
    "/reporting/launches/compare",
    "/reporting/launches/new",
    // The per-launch routes (`/[id]`, `/[id]/edit`, `/[id]/enter`) are
    // deliberately NOT here. They take an id, and a made-up one 404s
    // whether the gate is present or not — the lookup fails either way —
    // so the test could never fail and would only cost a cold compile.
    // Their gate is the same one line, read off the source instead.
  ]) {
    const response = await page.goto(`${STAGE_2}${path}`);
    expect(response?.status(), `${path} should not exist at stage 2`).toBe(404);
  }

  // And the tab bar does not offer them either.
  await page.goto(`${STAGE_2}/reporting?month=${MONTHS.sep}`);
  for (const tab of ["Ads", "Funnels", "Trial Reels", "Client Experience", "Launches"]) {
    await expect(page.getByRole("link", { name: tab, exact: true })).toHaveCount(0);
  }
});
