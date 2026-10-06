import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { expectNothingAdminish, requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Funnels (§5.5), and the price a month keeps.
 *
 * The seed is the state the rules exist for: July saved at £500 and
 * published; September still a draft, captured at £500, with the offer
 * now selling at £800. So the screens can be watched holding July still
 * and offering to correct September.
 */

requireLocalStack();

const TAB = "funnels";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("a published month shows its own price and offers no way to change it", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/funnels?month=${MONTHS.jul}`);

  await expect(page.getByText(/July 2026 uses £500/)).toBeVisible();
  await expect(page.getByText(/published, so it stays/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /use the current price/i })).toHaveCount(0);
  await shoot(page, TAB, "01-published-price-held", w);
});

test("an unpublished month offers the current price, and takes it when pressed", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/funnels?month=${MONTHS.sep}`);

  await expect(page.getByText(/September 2026 uses £500/)).toBeVisible();
  const button = page.getByRole("button", { name: /use the current price \(£800\)/i });
  await expect(button).toBeVisible();
  await shoot(page, TAB, "02-correction-offered", w);

  await button.click();
  await expect(page.getByText(/September 2026 uses £800/)).toBeVisible();
  await expect(page.getByRole("button", { name: /use the current price/i })).toHaveCount(0);
  await shoot(page, TAB, "03-correction-taken", w);
});

test("re-saving September does not move July — December does not rewrite June", async ({
  page,
}) => {
  await signIn(page, "nina");

  // Correct September's figures, after the price has risen.
  await page.goto(`/reporting/enter/funnels?month=${MONTHS.sep}`);
  const purchases = page.getByLabel("Purchases", { exact: true }).first();
  await purchases.fill("9");
  await page.getByRole("button", { name: /save this month/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  // September keeps the price it captured, not today's £800.
  await expect(page.getByText(/September 2026 uses £500/)).toBeVisible();

  // And July, which is published, is untouched.
  await page.goto(`/reporting/enter/funnels?month=${MONTHS.jul}`);
  await expect(page.getByText(/July 2026 uses £500/)).toBeVisible();
});

test("revenue on the report uses each month's own price", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/funnels?month=${MONTHS.jul}`);
  const july = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // 10 purchases × £500.
  expect(july).toMatch(/Webinar funnel 1,000 20\.0% 10 £500 £5,000/);
  await shoot(page, TAB, "04-report-july", w);

  await page.goto(`/reporting/funnels?month=${MONTHS.sep}`);
  const september = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // 8 × £500, still, because September captured £500.
  expect(september).toMatch(/Webinar funnel 2,000 25\.0% 8 £500 £4,000/);
  await shoot(page, TAB, "05-report-september", w);
});

test("a funnel with no linked offer shows a dash, not £0", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/funnels?month=${MONTHS.sep}`);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Three purchases and no price: revenue is a dash. "It earned nothing"
  // would be a different and untrue claim.
  expect(text).toMatch(/Unlinked funnel 400 — 3 — —/);
  expect(text).not.toMatch(/Unlinked funnel 400 — 3 — £0/);

  await page.goto(`/reporting/enter/funnels?month=${MONTHS.sep}`);
  await expect(page.getByText(/no offer linked/i)).toBeVisible();
  await shoot(page, TAB, "06-unlinked", w);
});

test("pointing a funnel at another offer takes the new price, on a draft", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/funnels?month=${MONTHS.sep}`);

  const setup = page
    .locator("form")
    .filter({ has: page.locator('input[value="Unlinked funnel"]') });
  await setup.locator("select").selectOption({ label: "Signature programme" });
  await setup.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByText(/new offer's price/i)).toBeVisible();
  await shoot(page, TAB, "07-offer-changed", w);
});

test("the client sees funnels once published, and nothing of the team's", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "client");

  // July is published in the seed.
  await page.goto(`/reporting/funnels?month=${MONTHS.jul}`);
  await expect(page.getByText("Webinar funnel").first()).toBeVisible();
  await expect(page.getByText(/£5,000/).first()).toBeVisible();
  await expectNothingAdminish(page);
  await shoot(page, TAB, "08-report-client", w);

  // September is a draft.
  await page.goto(`/reporting/funnels?month=${MONTHS.sep}`);
  await expect(page.getByText(/isn.t ready yet/i)).toBeVisible();
  await expect(page.getByText("Webinar funnel")).toHaveCount(0);
});
