import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { expectNothingAdminish, requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Ads (§5.7), clicked through as the real people.
 *
 * The rule under test is the one the category turns on: **cost per lead
 * counts lead- and sales-goal campaigns only**, and a campaign nobody has
 * classified is left out of it and said to be left out.
 *
 * The seed gives Northwind Studio the §10.2 sample's shape — £600 of
 * spend over 100 leads, of which £450 is on lead and sales campaigns, and
 * one £50 campaign with no goal.
 */

requireLocalStack();

const TAB = "ads";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("the entry screen names the campaign with no goal, and says it is not counted", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);

  await expect(page.getByText(/one campaign has no goal set/i)).toBeVisible();
  await expect(page.getByText(/Unclassified/).first()).toBeVisible();
  await expect(page.getByText(/not counted.*cost per lead|cost per lead.*not counted/i).first()).toBeVisible();
  await shoot(page, TAB, "01-no-goal-warning", w);
});

test("cost per lead is the lead-goal figure, not the blended one", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);

  const card = page.getByRole("complementary");
  const text = (await card.innerText()).replace(/\s+/g, " ");

  // £450 over 100 leads is £4.50. Blended over all £600 it would be £6.00,
  // which is the number this must not be.
  expect(text).toMatch(/Total spend £600/);
  expect(text).toMatch(/Leads 100/);
  expect(text).toMatch(/Cost per lead £4\.50/);
  expect(text).not.toMatch(/Cost per lead £6/);
  expect(text).toMatch(/1 not counted/);
  await shoot(page, TAB, "02-worked-out", w);
});

test("giving the goalless campaign a goal moves the figure", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);

  // The proof it was genuinely excluded rather than happening to agree.
  // The campaign's own setup form, found by the name field holding its
  // name rather than by hunting for a wrapping div.
  const setup = page.locator("form").filter({ has: page.locator('input[value="Unclassified"]') });
  await setup.locator("select").selectOption("leads");
  await setup.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/updated/i).first()).toBeVisible();

  await page.reload();
  const text = (await page.getByRole("complementary").innerText()).replace(/\s+/g, " ");
  // £5 exactly, not £5.00: whole pounds stay whole, and the point is
  // that the figure moved from £4.50 when the campaign gained a goal.
  expect(text).toMatch(/Cost per lead £5\b/);
  expect(text).not.toMatch(/Cost per lead £4\.50/);
  await expect(page.getByText(/no goal set/i)).toHaveCount(0);
  await shoot(page, TAB, "03-goal-set", w);
});

test("the figures a team member enters are the figures the report shows", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "elize");

  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);
  const cardText = (await page.getByRole("complementary").innerText()).replace(/\s+/g, " ");

  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  const reportText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await shoot(page, TAB, "04-report-admin", w);

  // §9: the live card and the report, on the same month.
  // Case-insensitive: the report's KPI labels are uppercased in CSS, and
  // innerText returns what is rendered.
  for (const [label, pattern] of [
    ["Cost per lead", /Cost per lead\s+(£[\d.,]+)/i],
    ["CPM", /CPM\s+(£[\d.,]+)/i],
    ["CTR", /CTR\s+([\d.,]+%)/i],
  ] as const) {
    const inCard = cardText.match(pattern)?.[1];
    const inReport = reportText.match(pattern)?.[1];
    expect(inCard, `${label} is not on the entry card`).toBeTruthy();
    expect(inReport, `${label} is not on the report`).toBeTruthy();
    expect(inCard, `${label}: card ${inCard}, report ${inReport}`).toBe(inReport);
  }

  // The totals row adds up, and reach is not summed.
  expect(reportText).toMatch(/Total\s+£600/);
  expect(reportText).toMatch(/not summed/);
});

test("the client sees the campaigns once it is published, and nothing of the team's", async ({
  page,
}, info) => {
  const w = width(info.project.name);

  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible();

  await signIn(page, "client");
  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);

  await expect(page.getByText("Lead form").first()).toBeVisible();
  await expect(page.getByText(/Cost per lead/i).first()).toBeVisible();
  await expectNothingAdminish(page);
  await shoot(page, TAB, "05-report-client", w);
});

test("a draft month shows the client nothing of it", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "client");

  // September is a draft in the seed until somebody publishes it.
  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  await expect(page.getByText(/isn.t ready yet/i)).toBeVisible();
  await expect(page.getByText("Lead form")).toHaveCount(0);
  await expect(page.getByText(/£600/)).toHaveCount(0);
  await shoot(page, TAB, "06-client-draft", w);
});

test("the client cannot reach the entry screen at all", async ({ page }) => {
  await signIn(page, "client");
  await page.goto("/reporting/enter/ads");
  // Sent to the report for that category rather than shown a refusal: it
  // is not a screen they should have to think about.
  await expect(page).toHaveURL(/\/reporting\/ads/);
  await expect(page.getByRole("button", { name: /save this month/i })).toHaveCount(0);
});

test("the Leads tab shows the real figure from Ads, not a second box", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // §4, "enter once, use everywhere": "new leads from ads" is pulled, so
  // the number on Leads must be the one the campaigns add up to — and
  // there must be nowhere to type it a second time and disagree.
  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  const adsText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const adsLeads = adsText.match(/Total\s+£600\s+4,200\s+([\d,]+)/)?.[1];
  expect(adsLeads, `the Ads total row did not parse: ${adsText.slice(0, 300)}`).toBe("100");

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  const leadsText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const fromAds = leadsText.match(/New leads from ads\s+([\d,]+)/i)?.[1];

  expect(fromAds, `"New leads from ads" is not on the Leads page at all`).toBeTruthy();
  expect(fromAds, `Ads says ${adsLeads}, Leads says ${fromAds}`).toBe("100");

  // And it is in the source split, so the total counts it.
  const total = leadsText.match(/Total leads\s+([\d,]+)/i)?.[1];
  expect(total, "Total leads is not on the page").toBeTruthy();
  expect(Number(total?.replace(",", ""))).toBeGreaterThanOrEqual(100);

  await shoot(page, TAB, "07-leads-from-ads", w);

  // Nowhere to type it: a box here would be a second answer.
  await page.goto(`/reporting/enter/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByLabel(/new leads from ads/i)).toHaveCount(0);
});
