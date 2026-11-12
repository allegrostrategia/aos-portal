import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/** The card with this heading — not the first card that merely mentions it. */
const card = (page: import("@playwright/test").Page, heading: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/**
 * Financials: two grids, money received and money expected.
 *
 * Nina, 13 November. The case the whole redesign turns on is walked here
 * end to end, because it is the one no unit test can see: a client who
 * paid one-off in a published January and goes onto a retainer in April,
 * on the same row, with no unpublish message anywhere.
 */

requireLocalStack();

const TAB = "sales-grid";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("what came in, what you expect, and a refund", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  // --- rows, named by the client -------------------------------------------
  const setup = card(page, "Your rows");
  await expect(setup.getByText(/List your offers, or list a client by name/i)).toBeVisible();
  await setup.getByLabel("Name").fill("Signature programme");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Signature programme added/i)).toBeVisible();

  await setup.getByLabel("Name").fill("Bella Ltd");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByLabel("Does it recur?").selectOption("monthly");
  // Submitted from the field: on a phone the "added" notice from the
  // first row can sit over the button between layouts, which is a race in
  // the test rather than anything the person would hit.
  await setup.getByLabel("Name").press("Enter");
  await expect(page.getByText(/Bella Ltd added/i)).toBeVisible();

  await shoot(page, TAB, "01-rows", w);

  // --- what came in --------------------------------------------------------
  const came = card(page, "What came in");
  await expect(came.getByText(/A refund or a chargeback goes in as a minus/i)).toBeVisible();
  await expect(came.getByText(/Signed a new retainer client\?/i)).toBeVisible();

  const cell = (name: string, month: string) =>
    came.getByLabel(new RegExp(`^${name}, ${month}$`));
  await cell("Signature programme", "September 2026").fill("2000");
  await cell("Bella Ltd", "September 2026").fill("400");
  // A chargeback: less than nothing landed on that row that month.
  await cell("Bella Ltd", "October 2026").fill("-250");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await expect(came.getByText(/^Saved\.$/)).toBeVisible();

  // The month's three figures, all from what was typed and none derived.
  const strip = card(page, "This month");
  const stripText = (await strip.innerText()).replace(/\s+/g, " ");
  expect(stripText, "came in").toContain("£2,400");
  expect(stripText, "and the retainer is the recurring part").toContain("£400");

  await shoot(page, TAB, "02-what-came-in", w);

  // --- what you expect, pasted across the months ---------------------------
  const expected = card(page, "What you expect");
  await expect(expected.getByText(/Type it, or paste a row of figures straight in/i)).toBeVisible();

  const first = expected.getByLabel(/^Bella Ltd, September 2026$/);
  await first.focus();
  // "typed or pasted by hand into however many months it lasts" — four
  // months of a retainer, straight off a spreadsheet row.
  await page.evaluate(() => {
    const input = document.activeElement as HTMLInputElement;
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "400\t400\t400\t400" },
    });
    input.dispatchEvent(event);
  });
  await expect(expected.getByLabel(/^Bella Ltd, December 2026$/)).toHaveValue("400");

  await expected.getByRole("button", { name: /save the forecast/i }).click();
  await expect(expected.getByText(/^Saved\.$/)).toBeVisible();
  await shoot(page, TAB, "03-what-you-expect", w);
});

test("a published month is fixed, and a retainer can still start after it", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = card(page, "Your rows");
  await setup.getByLabel("Name").fill("Bella Ltd");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Bella Ltd added/i)).toBeVisible();

  // September: a one-off, while the row still says it does not recur.
  const came = card(page, "What came in");
  await came.getByLabel(/^Bella Ltd, September 2026$/).fill("1200");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await expect(came.getByText(/^Saved\.$/)).toBeVisible();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const published = card(page, "What came in");
  await expect(published.getByLabel(/^Bella Ltd, September 2026$/)).toBeDisabled();
  await expect(published.getByText(/September 2026 is published, so its column is fixed/i)).toBeVisible();
  await shoot(page, TAB, "04-published", w);

  // **They go onto a retainer in October**, with September published.
  // Ticking the row is a change to the starting point for new months, not
  // to September — so it goes through, with no unpublish message.
  const setupAgain = card(page, "Your rows");
  const tick = setupAgain.getByLabel(/^Does Bella Ltd recur\?$/);
  await expect(tick).toHaveValue("none");
  await tick.selectOption("monthly");
  await setupAgain.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/Bella Ltd updated/i)).toBeVisible();
  // **The control still says what was saved.** React resets an
  // uncontrolled field once a form action finishes, which left this
  // reading "No, one-off" beside a notice saying it had been updated.
  await expect(tick).toHaveValue("monthly");

  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(body, "nothing was refused, so nothing says so").not.toContain(
    "figures in a published month",
  );

  // October is still a draft, so its column takes the retainer's figure.
  await published.getByLabel(/^Bella Ltd, October 2026$/).fill("400");
  await published.getByRole("button", { name: /save what came in/i }).click();
  await expect(published.getByText(/^Saved\.$/)).toBeVisible();

  // And September's figure did not move.
  await expect(published.getByLabel(/^Bella Ltd, September 2026$/)).toHaveValue("1200");
  await shoot(page, TAB, "05-retainer-after-publish", w);
});
