import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

type Page = import("@playwright/test").Page;

/** The card with this heading — not the first card that merely mentions it. */
const card = (page: Page, heading: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/**
 * How far the page itself scrolls sideways, which should always be none.
 *
 * Dom, 13 November, on a phone screenshot: a strip of bare background
 * down the right of every screen. A grid that is wider than a phone is
 * the point — a year has twelve columns — but it scrolls **inside its
 * card**, and the page does not move. Asserted rather than looked at,
 * because an element 40px too wide is invisible until it is measured.
 */
const sidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });

/**
 * Anything past the right edge that nothing clips, named.
 *
 * A grid wider than the screen is the point, so an element sticking out
 * **inside a scroller** is not a fault — it is the thing that scrolls.
 * What matters is an element past the edge with no clipping ancestor,
 * because that is what drags the page itself sideways.
 */
const whatOverflows = (page: Page) =>
  page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const clipped = (el: HTMLElement) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll" || x === "hidden") return true;
      }
      return false;
    };
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > limit + 1 && !clipped(el))
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
  });

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

  // A third row, for the month a chargeback happened on.
  await setup.getByLabel("Name").fill("Mini course");
  await setup.getByLabel("What it is").selectOption("offer");
  await setup.getByLabel("Name").press("Enter");
  await expect(page.getByText(/Mini course added/i)).toBeVisible();

  await shoot(page, TAB, "01-rows", w);

  // --- what came in --------------------------------------------------------
  const came = card(page, "What came in");
  await expect(came.getByText(/A refund or a chargeback goes in as a minus/i)).toBeVisible();
  await expect(came.getByText(/Signed a new retainer client\?/i)).toBeVisible();

  const cell = (name: string, month: string) =>
    came.getByLabel(new RegExp(`^${name}, ${month}$`));
  await cell("Signature programme", "September 2026").fill("2000");
  await cell("Bella Ltd", "September 2026").fill("400");

  // **What came in cannot run ahead of the month being entered.** October
  // has not happened; its column is on screen so the grids line up, with
  // no input in it and the heading saying where that money goes.
  await expect(cell("Bella Ltd", "October 2026")).toHaveCount(0);
  await expect(came.getByRole("columnheader", { name: /oct/i })).toContainText(/forecast/i);

  // **A chargeback on the mini course**: one customer took their money
  // back and nothing else sold, so less than nothing landed on that row
  // that month. It goes in as a minus and comes off the month.
  await cell("Mini course", "September 2026").fill("-250");

  // The whole year, which is July to December here — and July is
  // published, so it is on screen and fixed rather than missing.
  await came.getByRole("button", { name: /show the whole year/i }).click();
  await expect(cell("Bella Ltd", "July 2026")).toBeDisabled();

  await came.getByRole("button", { name: /save what came in/i }).click();
  await expect(came.getByText(/^Saved\.$/)).toBeVisible();

  // The month's three figures, all from what was typed and none derived.
  const strip = card(page, "This month");
  const stripText = (await strip.innerText()).replace(/\s+/g, " ");
  expect(stripText, "came in, with the refund off it").toContain("£2,150");
  expect(stripText, "and the retainer is the recurring part").toContain("£400");

  // **And "Worked out for you" says the same thing** (Dom, 13 November).
  // The card above the grids used to read "Revenue from offers —" with
  // £2,400 sitting in the grid below it, because revenue was pulled from
  // the Offers screen. It reads the grid now, so the two cannot differ.
  const worked = (
    await page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Worked out for you" }) })
      .innerText()
  ).replace(/\s+/g, " ");
  expect(worked, "revenue from the two offer rows, the refund off it").toContain("£1,750");
  expect(worked, "the retainer client").toContain("£400");
  expect(worked, "and the month, which is what the grid totals").toContain("£2,150");

  expect(await whatOverflows(page), "nothing sticks out sideways").toEqual([]);
  expect(await sidewaysScroll(page)).toBe(0);

  await shoot(page, TAB, "02-what-came-in", w);

  // --- what you expect, pasted across the months ---------------------------
  const expected = card(page, "What you expect");
  await expect(expected.getByText(/Type it, or paste a row of figures straight in/i)).toBeVisible();

  // The same October cell the Actual grid refuses is an input here.
  await expect(expected.getByLabel(/^Bella Ltd, October 2026$/)).toBeVisible();

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

  await expected.getByRole("button", { name: /save what you expect/i }).click();
  await expect(expected.getByText(/^Saved\.$/)).toBeVisible();
  expect(await sidewaysScroll(page), "still no sideways scroll").toBe(0);
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
  //
  // **No Save button beside it** (Dom, 13 November): one control carrying
  // one decision saves itself, and the notice is what confirms it.
  const setupAgain = card(page, "Your rows");
  const tick = setupAgain.getByLabel(/^Does Bella Ltd recur\?$/);
  await expect(tick).toHaveValue("none");
  await expect(setupAgain.getByRole("button", { name: /^save$/i })).toHaveCount(0);
  await tick.selectOption("monthly");
  await expect(page.getByText(/Bella Ltd updated/i)).toBeVisible();
  // **The control still says what was saved.** React resets an
  // uncontrolled field once a form action finishes, which left this
  // reading "No, one-off" beside a notice saying it had been updated.
  await expect(tick).toHaveValue("monthly");

  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(body, "nothing was refused, so nothing says so").not.toContain(
    "figures in a published month",
  );

  // **October's money is entered on October's screen**, which is the
  // other half of the same rule: what came in never runs ahead of the
  // month being entered, and the way to a later month is to go to it.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.oct}`);
  const october = card(page, "What came in");
  await october.getByLabel(/^Bella Ltd, October 2026$/).fill("400");
  await october.getByRole("button", { name: /save what came in/i }).click();
  await expect(october.getByText(/^Saved\.$/)).toBeVisible();

  // September is still published, still 1200, and still fixed.
  await expect(october.getByLabel(/^Bella Ltd, September 2026$/)).toHaveValue("1200");
  await expect(october.getByLabel(/^Bella Ltd, September 2026$/)).toBeDisabled();
  // And October's £400 is the recurring part of October, from the cell's
  // own copy of the setting — September's £1,200 is not.
  const octoberStrip = (await card(page, "This month").innerText()).replace(/\s+/g, " ");
  expect(octoberStrip, "recurring in October").toContain("£400");

  expect(await sidewaysScroll(page)).toBe(0);
  await shoot(page, TAB, "05-retainer-after-publish", w);
});

/**
 * The third grid: what it cost.
 *
 * Nina's twenty-odd categories, offered as a list and then theirs to
 * rename and retire — and the rule the other two grids do not have: a
 * category feeds one of four buckets, which is what Total costs, Profit
 * and the margin are built on.
 */
test("what it cost, by category, in the four buckets", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  // Something to earn against, so the margin on the card is a real one.
  const setup = card(page, "Your rows");
  await setup.getByLabel("Name").fill("Signature programme");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await expect(page.getByText(/Signature programme added/i)).toBeVisible();

  const came = card(page, "What came in");
  await came.getByLabel(/^Signature programme, September 2026$/).fill("4000");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await expect(came.getByText(/^Saved\.$/)).toBeVisible();

  // --- the categories ------------------------------------------------------
  const categories = card(page, "Your cost categories");
  await expect(categories.getByText(/What a category feeds is set when it/i)).toBeVisible();
  await categories.getByRole("button", { name: /start with the usual list/i }).click();
  await expect(page.getByText(/categories added/i)).toBeVisible();

  // The list stays open straight after adding it — they have just made
  // those rows — and is folded away on the next visit: twenty rows of
  // setup is not what a screen for entering numbers opens on.
  await expect(categories.getByLabel(/^Name of Subscriptions$/)).toBeVisible();
  await page.reload();
  await expect(categories.getByLabel(/^Name of Subscriptions$/)).toHaveCount(0);
  await categories.getByRole("button", { name: /rename or retire a category \(21\)/i }).click();

  // **Renaming saves when the field is left** — no Save button on any of
  // twenty rows, which is the rule the recurring tick above follows.
  const name = categories.getByLabel(/^Name of Subscriptions$/);
  await name.fill("Software subscriptions");
  await name.blur();
  await expect(page.getByText(/Software subscriptions renamed/i)).toBeVisible();
  await expect(categories.getByRole("button", { name: /^rename$/i })).toHaveCount(0);

  await shoot(page, TAB, "06-cost-categories", w);

  // --- the grid ------------------------------------------------------------
  const cost = card(page, "What it cost");
  await cost.getByLabel(/^Software, September 2026$/).fill("300");
  await cost.getByLabel(/^Ads, September 2026$/).fill("250");
  await cost.getByLabel(/^Staff, September 2026$/).fill("500");
  await cost.getByRole("button", { name: /save what it cost/i }).click();
  await expect(cost.getByText(/^Saved\.$/)).toBeVisible();

  // The four buckets, which is the whole reason a category has one.
  // The heading is typeset with a real apostrophe, so it is matched by
  // shape rather than by a string with a straight one in it.
  const buckets = (
    await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /month.s costs/i }) })
      .innerText()
  ).replace(/\s+/g, " ");
  expect(buckets, "fixed").toContain("£300");
  expect(buckets, "variable").toContain("£250");
  expect(buckets, "team").toContain("£500");

  // **And "Worked out for you" is the same arithmetic.** £4,000 in,
  // £1,050 out, which is the figure the report will carry.
  const worked = (
    await page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Worked out for you" }) })
      .innerText()
  ).replace(/\s+/g, " ");
  expect(worked, "total costs").toContain("£1,050");
  expect(worked, "profit").toContain("£2,950");

  expect(await whatOverflows(page), "nothing sticks out sideways").toEqual([]);
  expect(await sidewaysScroll(page)).toBe(0);
  await shoot(page, TAB, "07-what-it-cost", w);
});
