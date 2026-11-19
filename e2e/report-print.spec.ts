import { expect, test } from "./quiet.ts";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * The whole month as a document (§11).
 *
 * Browser print-to-PDF of a clean page, the same answer the SOP export
 * gave. What is asserted here is what a PDF would carry: the month's
 * figures in the report's own order, the notes written on them, and
 * none of the screen's furniture.
 */

requireLocalStack();

test("the month prints as a document, with its figures and its notes", async ({
  page,
}, info) => {
  const w = (info.project.name === "phone" ? "phone" : "desktop") as "phone" | "desktop";
  const { seed, MONTHS } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  await signIn(page, "nina");

  // Money in, so there is something to print.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Your rows", exact: true }) });
  await setup.getByLabel("Name").fill("Bella Ltd");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await page.getByText(/Bella Ltd added/i).waitFor();

  const came = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "What came in", exact: true }) });
  await came.getByLabel(/^Bella Ltd, September 2026$/).fill("2000");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await came.getByText(/^Saved\.$/).waitFor();

  // A note on the month, which is the half of a report that is not a figure.
  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  await page.getByPlaceholder(/What happened this month/i).fill("Retainer revenue held up.");
  await page.getByRole("button", { name: /save note/i }).click();
  await expect(page.getByText(/Retainer revenue held up/i).first()).toBeVisible();

  // --- the document --------------------------------------------------------
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("link", { name: /save as pdf/i }).click();
  await page.waitForURL(/\/reporting\/print/);

  const doc = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(doc, "whose month it is").toContain("Northwind Studio");
  expect(doc, "and which month").toContain("September 2026");
  expect(doc, "a draft says so, so nobody files one thinking it went out").toContain(
    "has not been published yet",
  );
  expect(doc, "the figures").toContain("£2,000");
  expect(doc, "the note written on them").toContain("Retainer revenue held up.");
  expect(doc, "and how to get the PDF out").toContain("Save as PDF");

  // **And everything their report pages hold** (Dom, 14 November). The
  // first version was figures and notes, so a month of ads printed as a
  // page of averages with no campaign table under it.
  for (const [what, text] of [
    ["the Overview's own panels", /Look at these first|What went WELL/],
    ["the leads chart", /Where the leads came from/],
    ["the Ads campaign table", /Cost per lead|CPM/],
    ["a trend chart", /The last twelve months|The last six months/],
  ] as const) {
    expect(doc, what).toMatch(text);
  }

  // **A page per launch** (Nina's item 10, 19 November): the summary row
  // is what a reader skims, and the launch itself is what she asked to
  // be in the document rather than only on a screen. The seed's Autumn
  // challenge is live in September, so it is in this month's report.
  for (const [what, text] of [
    ["the launch's own heading", /Autumn challenge/],
    ["its goals, as sentences rather than bars", /Sign-ups: Good 1,000 — hit, Better 1,500/],
    ["where the people came from", /Where they came from/],
    ["the client's own source names", /Email list/],
    ["what the ads cost", /Cost per click/],
    ["and the emails, with their subject lines", /The challenge starts Monday/],
    ["a resend named as one", /\(resend\)/],
  ] as const) {
    expect(doc, what).toMatch(text);
  }

  // A launch nobody has typed into is listed in the summary and gets no
  // page of its own: one line of goals and seven dashes is furniture.
  expect(doc, "the planned launch is still listed").toContain("Spring relaunch");
  expect(doc, "but has no page").not.toMatch(/Spring relaunch No dates set Sales: Good/);

  for (const [what, text] of [
    ["the document still ends where it did", /prepared by Allegro Strategia/],
  ] as const) {
    expect(doc, what).toMatch(text);
  }

  // Drawn as SVG, not described in prose: the charts are the same
  // components the screens use.
  const charts = await page.locator("main svg").count();
  expect(charts, "charts in the document").toBeGreaterThan(2);

  // None of the screen's furniture: no tab row, no entry buttons.
  await expect(page.getByRole("link", { name: "Enter data" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Social Media" })).toHaveCount(0);

  await shoot(page, "report-print", "01-document", w);
});

test("a client cannot print a month they have not been shown", async ({ page }) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "client");

  // September is a draft in the seed. The URL is reachable; the month is
  // not, and RLS is only half of that — this is the other half.
  await page.goto(`/reporting/print?month=${MONTHS.sep}`);
  await expect(page).not.toHaveURL(/\/reporting\/print/);
});
