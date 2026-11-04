import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Turning hours tracking off on Offers (Nina, 3 November).
 *
 * §5.9 asks every offer for hours spent delivering. For a service
 * business it is the figure that makes Offers worth filling in; for
 * somebody selling a product it is a box nobody can answer, and a box
 * nobody can answer is how a month gets abandoned half-done.
 *
 * **Display only**, which is the half worth testing hardest: the hours
 * already typed are still in the database with the switch off, and come
 * back untouched when it goes on. That is the same promise hiding a
 * whole section makes, and rule 7 — nothing is ever deleted — is the
 * reason for it.
 */

requireLocalStack();

const TAB = "offer-hours";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

const hoursInTheDatabase = async () => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  return sql(`select count(*)::text from public.report_values
               where metric_key = 'offers_hours_spent_delivering';`);
};

test("the switch takes hours off both screens, and leaves the figures in the database", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // On by default, so nothing changes for a client who has one today —
  // and the hours this test is about are typed through the real screen
  // rather than seeded, so "nothing was deleted" is about a figure
  // somebody actually entered.
  await page.goto(`/reporting/enter/offers?month=${MONTHS.sep}`);
  await expect(page.getByLabel("Hours spent delivering").first()).toBeVisible();
  await page.getByLabel("Hours spent delivering").first().fill("18");
  await page.getByLabel("Revenue this month").first().fill("4000");
  await page.getByLabel("Units sold").first().fill("8");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);
  await expect(page.getByText("Hourly rate").first()).toBeVisible();

  const before = await hoursInTheDatabase();
  expect(Number(before), "there are hours to lose").toBeGreaterThan(0);

  await page.goto("/reporting/settings");
  await page.getByLabel(/Track hours on offers/i).uncheck();
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await shoot(page, TAB, "01-switch-off", w);

  // The entry screen: the box is gone, not disabled.
  await page.goto(`/reporting/enter/offers?month=${MONTHS.sep}`);
  await expect(page.getByLabel("Hours spent delivering")).toHaveCount(0);
  await expect(page.getByText("Effective hourly rate")).toHaveCount(0);
  await shoot(page, TAB, "02-entry-without-hours", w);

  // The report: the pair on each offer card, and the two summary cards.
  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);
  const report = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(report).not.toMatch(/Hourly rate|Hours spent delivering|Effective hourly rate/);
  // And what is left still works: revenue and margin are built from
  // other direct costs as well, so they are not hours figures.
  expect(report).toMatch(/margin/i);
  await shoot(page, TAB, "03-report-without-hours", w);

  // **And no target can be set for a figure nobody will see.** The
  // targets page reads the metric list straight rather than through the
  // report's figures, so it is the one place a switched-off figure can
  // come back wearing a box to type in.
  await page.goto("/reporting/targets");
  await expect(page.getByText("Overall effective hourly rate")).toHaveCount(0);
  await expect(page.getByText("Total revenue from offers").first()).toBeVisible();

  // **Nothing was deleted.** The whole point of the switch being a
  // display setting.
  expect(await hoursInTheDatabase()).toBe(before);

  // And switching it back on brings them back.
  await page.goto("/reporting/settings");
  await page.getByLabel(/Track hours on offers/i).check();
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);
  await expect(page.getByText("Hourly rate").first()).toBeVisible();
});
