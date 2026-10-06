import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { expectNothingAdminish, requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Trial Reels (§5.3), clicked through.
 *
 * The figures are an ordinary month-level form; what is worth watching
 * is the pair of lists and the Proven marker, which is the only thing in
 * the reporting tool that looks across months at words rather than
 * numbers.
 *
 * The seed gives August and September the same top hook, and September a
 * new one — so one is Proven and one is not, on the same screen.
 */

requireLocalStack();

const TAB = "trial-reels";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("the lists sit under the figures, and mark what has proved itself", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);

  await expect(page.getByText(/what worked this month/i)).toBeVisible();
  // By role: the plain text also matches the screen-reader labels on
  // each of the three inputs.
  await expect(page.getByRole("heading", { name: /top three hooks/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /top three b-roll clips/i })).toBeVisible();

  // August and September share this one, so it is Proven in two months.
  await expect(page.getByText(/Proven · 2 months/).first()).toBeVisible();
  // And exactly one of them is: the new hook and the b-roll are not.
  await expect(page.getByText(/Proven ·/)).toHaveCount(1);

  await shoot(page, TAB, "01-lists-with-proven", w);
});

test("a new hook becomes Proven the month it comes back", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);

  // Retype August's second hook into September's third slot. Capitals
  // and spacing differ on purpose: it is the same hook.
  await page.locator("#item-hook-3").fill("  A ONE-OFF that did well  ");
  await page.locator("#item-hook-3-views").fill("7000");
  await page.getByRole("button", { name: /save what worked/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await expect(page.getByText(/Proven ·/)).toHaveCount(2);
  await shoot(page, TAB, "02-second-proven", w);
});

test("clearing a line removes it", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);

  await page.locator("#item-hook-2").fill("");
  await page.getByRole("button", { name: /save what worked/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await expect(page.locator("#item-hook-2")).toHaveValue("");
  await expect(page.getByText("Brand new this month")).toHaveCount(0);
  await shoot(page, TAB, "03-line-cleared", w);
});

test("an assigned team member can do all of it", async ({ page }) => {
  await signIn(page, "elize");
  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);

  await page.locator("#item-b_roll-2").fill("Close-up of the notebook");
  await page.getByRole("button", { name: /save what worked/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await expect(page.locator("#item-b_roll-2")).toHaveValue("Close-up of the notebook");
});

test("the client reads the lists once the month is published", async ({ page }, info) => {
  const w = width(info.project.name);

  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible();

  await signIn(page, "client");
  await page.goto(`/reporting/trial-reels?month=${MONTHS.sep}`);

  await expect(page.getByText("The one thing nobody tells you")).toBeVisible();
  await expect(page.getByText(/Proven · 2 months/)).toBeVisible();
  await expect(page.getByText(/51,000 views/)).toBeVisible();
  await expectNothingAdminish(page);
  await shoot(page, TAB, "04-report-client", w);
});

test("a draft month shows the client none of it", async ({ page }) => {
  await signIn(page, "client");
  await page.goto(`/reporting/trial-reels?month=${MONTHS.sep}`);

  await expect(page.getByText(/isn.t ready yet/i)).toBeVisible();
  await expect(page.getByText("The one thing nobody tells you")).toHaveCount(0);
});

test("nothing claims a benchmark that does not exist yet", async ({ page }) => {
  // §5.3's "follow rate below benchmark" note is deliberately absent
  // until benchmarks are built. A hard-coded threshold wearing the word
  // "benchmark" would be worse than no note at all.
  await signIn(page, "nina");
  await page.goto(`/reporting/trial-reels?month=${MONTHS.sep}`);
  const text = await page.locator("main").innerText();

  expect(text).not.toMatch(/benchmark/i);
  expect(text).not.toMatch(/below (the )?average/i);
});
