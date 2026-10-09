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

  // The cover upload is a POST, so it is asked as one. It is the only
  // route in the module that is not a page, and `/api` is public to the
  // proxy by design — route handlers authenticate themselves — so its
  // stage check is the only thing standing in front of it.
  //
  // **With a REAL launch id**, and signed in, which is the whole point:
  // a made-up one answers 404 whether the gate is there or not, because
  // the lookup fails either way. The first version of this test did
  // exactly that and could not fail — the same trap as the per-launch
  // page routes above, walked into twice.
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const realLaunch = sql("select id from public.report_launches where name = 'Autumn challenge'");
  // And `maxRedirects: 0`, because without it the 303 this route sends
  // on a refusal is followed to the setup screen — which is gated too,
  // so the final status was 404 whatever the route itself answered. The
  // second way this same test managed not to be able to fail.
  const posted = await page.request.post(`${STAGE_2}/api/launch-cover`, {
    multipart: { launch_id: String(realLaunch) },
    maxRedirects: 0,
  });
  expect(posted.status(), "the cover upload should not exist at stage 2").toBe(404);

  // And the tab bar does not offer them either.
  await page.goto(`${STAGE_2}/reporting?month=${MONTHS.sep}`);
  for (const tab of ["Ads", "Funnels", "Trial Reels", "Client Experience", "Launches"]) {
    await expect(page.getByRole("link", { name: tab, exact: true })).toHaveCount(0);
  }
});

test("Stage 5's additions are absent at the production flag", async ({ page }) => {
  // **Harder to hide than the stages before it.** Stages 3 and 4 were
  // new routes, invisible by not existing. Stage 5 adds things to
  // screens a person already opens, so each one has to ask the switch —
  // and `dom` has a real member workspace on live, so "it would not
  // match anybody" is not a defence.
  await signInAtStage2(page, "member");

  await page.goto(`${STAGE_2}/reporting?month=${MONTHS.sep}`);
  const report = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(report, "no reflection box").not.toMatch(/your reflection/i);
  expect(report, "no settings link").not.toMatch(/your report settings/i);
  expect(report, "no objectives card").not.toMatch(/focusing on next month/i);

  // The settings page has no route either.
  const settings = await page.goto(`${STAGE_2}/reporting/settings`);
  expect(settings?.status(), "/reporting/settings should not exist at stage 2").toBe(404);

  // And nothing on You offers it.
  await page.goto(`${STAGE_2}/you`);
  const you = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(you, "no way in from You").not.toMatch(/your monthly report/i);

  // Nor the Piazza card, which is the one Stage 5 surface on a screen
  // every member opens every day.
  await page.goto(`${STAGE_2}/piazza`);
  const piazza = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(piazza, "no report card on Piazza").not.toMatch(/it is not finished yet/i);
});
