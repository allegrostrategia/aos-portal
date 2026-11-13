import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

type Page = import("@playwright/test").Page;

/**
 * An offer's revenue is money received, in one place (Nina, 13 November).
 *
 * Two screens used to answer "what did this offer earn": the Offers
 * screen, typed per offer, and the Actual grid, where every pound that
 * came in is already entered. **Financials is money received**, so the
 * grid wins — an offer sold in September and paid in October earns in
 * October, and the margin and the effective hourly rate move with it.
 *
 * `offers_revenue_this_month` is `pulled`, and what makes that visible is
 * the absence of a box: the entry page renders the core and optional
 * metrics as inputs and the pulled ones on the worked-out card. So the
 * assertion worth having is **no input**, at either width, and the money
 * appearing as a read-only figure that moves when the grid changes.
 *
 * Walked through the real screens rather than asserted against the metric
 * row, because a migration that puts `core` back is exactly the change
 * that would pass a schema test and quietly return the box.
 */

requireLocalStack();

const TAB = "offer-revenue";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

/** The card with this heading — not the first card that merely mentions it. */
const card = (page: Page, heading: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("no revenue box on Offers, and the figure comes off the Financials grid", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  // --- the Offers screen asks for three figures, not four ------------------
  await page.goto(`/reporting/enter/offers?month=${MONTHS.sep}`);
  await expect(page.getByLabel("Units sold").first()).toBeVisible();

  // The box itself, by the metric's own label.
  await expect(page.getByLabel("Revenue this month")).toHaveCount(0);

  // **And nothing else on the screen asks for revenue either**, whatever
  // it is called. A box put back under a kinder label is the same box.
  const revenueInputs = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].filter((el) => {
      const id = el.getAttribute("id");
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const text = `${label?.textContent ?? ""} ${el.getAttribute("name") ?? ""}`;
      return /revenue/i.test(text);
    }).length,
  );
  expect(revenueInputs, "inputs on Offers asking for revenue").toBe(0);

  // Read-only, and a dash until a Financials row says otherwise: the
  // seeded offer has no linked row yet.
  const worked = page.getByText("Money received", { exact: true });
  await expect(worked.first()).toBeVisible();
  await shoot(page, TAB, "01-offers-without-a-revenue-box", w);

  // --- the money, entered where it actually lands --------------------------
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = card(page, "Your rows");
  await setup.getByLabel("Name", { exact: true }).fill("Signature programme");
  await setup.getByLabel("What it is").selectOption("offer");
  await setup.getByLabel("Link to an offer").selectOption({ label: "Signature programme" });
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Signature programme added/i)).toBeVisible();

  const came = card(page, "What came in");
  await came.getByLabel(/^Signature programme, September 2026$/).fill("2000");
  await came.getByRole("button", { name: "Save what came in" }).click();
  // **The exact notice, not /saved/i.** The add form's hint says "the
  // months already saved keep what they were saved with", so the loose
  // match was already on the page and the test sailed past the save into
  // a navigation that raced it. One run in two.
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  // --- and it is on the Offers screen, without having been typed there -----
  await page.goto(`/reporting/enter/offers?month=${MONTHS.sep}`);
  const money = page
    .locator("dl")
    .filter({ has: page.getByText("Money received", { exact: true }) })
    .first();
  await expect(money).toContainText("£2,000");

  // **The margin moved with it**, which is the half Nina asked for: 40
  // units at a £40 hourly cost is nothing without revenue to divide into.
  await page.getByLabel("Units sold").first().fill("4");
  await page.getByLabel("Hours spent delivering").first().fill("20");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText("Saved. Offers are up to date.")).toBeVisible();
  await expect(money).toContainText("£2,000");
  // (£2,000 − £0) ÷ 20 hours = £100, worked out from the grid's figure.
  await expect(money).toContainText("£100");
  await shoot(page, TAB, "02-offers-with-the-grid-figure", w);

  // And the report page agrees, which is §9's whole requirement.
  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);
  await expect(page.locator("main")).toContainText("£2,000");
  await shoot(page, TAB, "03-report", w);

  // **Still nothing typed against the pulled metric.** The action drops
  // the field out of its whitelist, so nothing reaches `report_values`
  // for it even if a stale form posts one.
  const { sql } = await import("../scripts/seed-test-db.mjs");
  expect(
    sql(`select count(*)::text from public.report_values
          where metric_key = 'offers_revenue_this_month';`),
  ).toBe("0");
});
