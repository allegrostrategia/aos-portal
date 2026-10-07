import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import {
  expectNothingAdminish,
  requireLocalStack,
  shoot,
  signIn,
  takeBackToDraft,
} from "./helpers.ts";

/**
 * The Overview — the screen a client opens.
 *
 * Everything Stage 3 added to it lands here at once: the two panels in
 * Nina's words, the target bar, and a traffic light on each KPI. It is
 * the most client-visible surface in the product and had no browser
 * coverage of its own until now.
 */

requireLocalStack();

const TAB = "overview";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("the two panels say what Nina wrote", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  await expect(page.getByText("Look at these first 👀")).toBeVisible();
  await expect(page.getByText("What went WELL this month")).toBeVisible();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Her punctuation, not a paraphrase of it.
  expect(text).toMatch(/than last month - (stunning|worth a proper look)/);
  await shoot(page, TAB, "01-panels", w);
});

test("a traffic light carries a word and says what it is against", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Colour is never the only carrier: red and green are the pair most
  // colourblind readers cannot separate.
  expect(text).toMatch(/(On track|Close|Off track) vs\. (target|benchmark|last month)/);
  await shoot(page, TAB, "02-traffic-lights", w);
});

test("setting a target puts a bar on the Overview and changes the sentence", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.getByText(/no targets set/i)).toBeVisible();
  await shoot(page, TAB, "03-no-targets", w);

  await page.goto(`/reporting/targets?month=${MONTHS.sep}`);
  await page.locator("#target-leads_conversions_new_clients").fill("10");
  await page.getByRole("button", { name: /save targets/i }).click();
  await expect(page.getByText(/1 target saved/i)).toBeVisible();
  await shoot(page, TAB, "04-targets-page", w);

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.getByText(/how this month is going/i)).toBeVisible();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Four of a target of ten: the bar, and the sentence that goes with a
  // target rather than the one that goes with last month.
  expect(text).toMatch(/4 of 10\s*40%/);
  expect(text).toMatch(/New clients is at 40% of your target - not there YET/);
  // And nothing contradicts itself: no sentence calls a fall "stunning".
  expect(text).not.toMatch(/MORE clients who left/);
  await shoot(page, TAB, "05-target-bar", w);
});

test("beating a target reads as beating it", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/targets?month=${MONTHS.sep}`);
  await page.locator("#target-leads_conversions_new_clients").fill("2");
  await page.getByRole("button", { name: /save targets/i }).click();
  await expect(page.getByText(/1 target saved/i)).toBeVisible();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toMatch(/New clients beat your target by 100% WOOOO/);
  await shoot(page, TAB, "06-target-beaten", w);
});

test("the client sees the panels and the lights, and nothing of the team's", async ({
  page,
}, info) => {
  const w = width(info.project.name);

  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible();

  await signIn(page, "client");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  await expect(page.getByText("Look at these first 👀")).toBeVisible();
  // Read off the rendered text: the word and "vs. …" are separate spans
  // so each wraps as a whole, so there is no single node to match.
  const clientText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(clientText).toMatch(/(On track|Close|Off track) vs\. (target|benchmark|last month)/);
  // The editor's half is theirs alone.
  await expect(page.getByText(/no targets set/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /set targets/i })).toHaveCount(0);
  await expectNothingAdminish(page);

  await shoot(page, TAB, "07-client", w);
});

test("a figure where falling is good reads both ways in Nina's words", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // July and August are published in the seed, and from 7 October that
  // means read-only. This test is about the sentences, not the lock, so it
  // takes both back to draft the way Nina would before typing.
  await takeBackToDraft(MONTHS.jul);
  await takeBackToDraft(MONTHS.aug);

  // The opening figure, so churn has a denominator and the good-down
  // figures on this tab are all live at once.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByLabel(/clients at the start/i).fill("20");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/this is the opening figure/i)).toBeVisible();

  // A rise to go with the fall the seed already has: issues raised 1 in
  // August and 4 in September, against clients who left 2 and then 0.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.aug}`);
  await page.getByLabel(/issues raised/i).fill("1");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
  await page.getByLabel(/issues raised/i).fill("4");
  await page.getByRole("button", { name: /^save/i }).first().click();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  // One of each, on one screen, to the character.
  expect(text).toMatch(/Clients who left down 2 - exactly the direction we want/);
  expect(text).toMatch(/Issues raised up 3 - not the direction we want, let's dig into WHY/);

  // And not a word of the old contradiction: the four sentences that
  // assume higher is better stay off these figures.
  expect(text).not.toMatch(/MORE clients who left/);
  expect(text).not.toMatch(/MORE issues raised/);
  expect(text).not.toMatch(/fewer clients who left/);

  await shoot(page, TAB, "08-good-down-both-ways", w);
});
