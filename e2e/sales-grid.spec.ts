import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Financials' sales grid: Nina's own tracker as a screen.
 *
 * The case the whole thing turns on is walked here end to end, in a
 * browser, because it is the one a unit test cannot see: £2,000 sold in
 * September as four £500s has to read as £2,000 of September sales and
 * £500 of September cash, and the two figures have to sit on the screen
 * at the same time saying different things.
 *
 * Then the published month: what was sold goes read-only, and "they
 * stopped" does not — a customer who walks away in November is news
 * about November, not a change to September.
 */

requireLocalStack();

const TAB = "sales-grid";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("a sale, its instalments, and the month's cash", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  // --- a row, named by the client ------------------------------------------
  const setup = page.locator("section", { hasText: "Your rows" }).first();
  await expect(setup.getByText(/List your offers, or list a client by name/i)).toBeVisible();
  await setup.getByLabel("Name").fill("Signature programme");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Signature programme added/i)).toBeVisible();

  await setup.getByLabel("Name").fill("Bella's retainer");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Bella's retainer added/i)).toBeVisible();

  await shoot(page, TAB, "01-rows", w);

  // --- £2,000 sold in September, paid in four £500s ------------------------
  const sold = page.locator("section", { hasText: "Sold in September" }).first();
  await sold.getByRole("button", { name: /record a sale/i }).click();
  await sold.getByLabel("Row").selectOption({ label: "Signature programme" });
  await sold.getByLabel("What it is worth").fill("2000");
  await sold.getByLabel("Spread over").fill("4");
  await sold.getByRole("button", { name: /fill the months/i }).click();

  // The suggestion, before anything is saved: four £500s, September first.
  await expect(page.locator('input[name="due:2026-09-01"]')).toHaveValue("500");
  await expect(page.locator('input[name="due:2026-12-01"]')).toHaveValue("500");
  await expect(sold.getByText(/The schedule adds up/i)).toBeVisible();

  // September's £500 is in the bank.
  await page.locator('input[name="paid:2026-09-01"]').check();
  await shoot(page, TAB, "02-editor", w);

  await sold.getByRole("button", { name: /record it/i }).click();
  await expect(page.getByText(/Sale recorded/i)).toBeVisible();

  // --- THE POINT: two figures, both right ---------------------------------
  const strip = page.locator("section", { hasText: "This month" }).first();
  await expect(strip.getByText("£2,000")).toBeVisible();
  await expect(strip.getByText("£500").first()).toBeVisible();
  const stripText = (await strip.innerText()).replace(/\s+/g, " ");
  expect(stripText, "sold is the whole sale").toContain("£2,000");
  expect(stripText, "cash is what arrived").toContain("£500");

  // Three instalments scheduled into the months ahead.
  const year = page.locator("section", { hasText: "The year" }).first();
  await expect(year.getByRole("cell", { name: /£500/ }).first()).toBeVisible();
  await shoot(page, TAB, "03-month-and-year", w);

  // --- the half-typed schedule says what is missing ------------------------
  await sold.getByRole("button", { name: /^edit$/i }).click();
  await page.locator('input[name="due:2026-12-01"]').fill("");
  await expect(sold.getByText(/£500\.00 still to put in a month|£500 still to put in a month/i)).toBeVisible();
  await sold.getByRole("button", { name: /save the sale/i }).click();
  await expect(page.getByText(/Sale updated/i)).toBeVisible();
  await expect(sold.getByText(/£500 not yet scheduled into a month/i)).toBeVisible();
  await shoot(page, TAB, "04-not-yet-scheduled", w);
});

test("a published month fixes what was sold, and still takes a cancellation", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = page.locator("section", { hasText: "Your rows" }).first();
  await setup.getByLabel("Name").fill("Bella's retainer");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Bella's retainer added/i)).toBeVisible();

  const sold = page.locator("section", { hasText: "Sold in September" }).first();
  await sold.getByRole("button", { name: /record a sale/i }).click();
  await sold.getByLabel("Row").selectOption({ label: "Bella's retainer" });
  await sold.getByLabel("What it is worth").fill("400");
  await sold.getByLabel("Billing").selectOption("monthly");
  await sold.getByLabel("Spread over").fill("1");
  await sold.getByRole("button", { name: /fill the months/i }).click();
  await page.locator('input[name="paid:2026-09-01"]').check();
  await sold.getByRole("button", { name: /record it/i }).click();
  await expect(page.getByText(/Sale recorded/i)).toBeVisible();

  // Published.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const published = page.locator("section", { hasText: "Sold in September" }).first();
  await expect(
    published.getByText(/This month is published, so what was sold is fixed/i),
  ).toBeVisible();
  await expect(published.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  await shoot(page, TAB, "05-published", w);

  // **But "they stopped" is still there**, which is what the guard exists
  // for. The field offers a month that will be accepted, not one that will
  // be refused.
  await published.getByRole("button", { name: /they stopped/i }).click();
  await expect(published.getByLabel(/month they stopped/i)).toHaveValue("2026-10");
  await published.getByLabel(/month they stopped/i).fill("2026-11");
  await published.getByRole("button", { name: /mark it/i }).click();
  await expect(page.getByText(/Marked as cancelled/i)).toBeVisible();

  // September still sold it. That is the whole point.
  const strip = page.locator("section", { hasText: "This month" }).first();
  expect((await strip.innerText()).replace(/\s+/g, " ")).toContain("£400");
  await expect(
    published.getByText(/Cancelled November 2026, and kept on the record/i),
  ).toBeVisible();
  // The month the sale was in, not a hardcoded one.
  await expect(published.getByText(/September 2026 sold it/i)).toBeVisible();
  await shoot(page, TAB, "06-cancelled-after-publish", w);
});
