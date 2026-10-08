import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Stage 4 — the Launches list.
 *
 * A launch is not a month, so this screen carries no month of its own.
 * The seed gives the retainer two: a finished one with §6.6's worked
 * numbers on it, and one still being planned, so the cards show two
 * statuses and the ring has something to draw.
 */

requireLocalStack();

const TAB = "launches";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("the team sees a card per launch, with its status and its goal", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");

  await expect(page.getByRole("link", { name: "Autumn challenge" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Spring relaunch" })).toBeVisible();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // 22 at £500 plus 8 at £600 at FULL CONTRACT VALUE is £15,800 — §6.4
  // counts a payment plan at what it will collect, not at its instalment
  // — from 30 sales against a goal of 30, so the ring is full.
  expect(text).toMatch(/£15,800/);
  expect(text).toMatch(/30 of 30/);
  // A status is a word before it is a colour, as the traffic lights are.
  expect(text).toMatch(/Completed/);
  expect(text).toMatch(/Planning/);

  await shoot(page, TAB, "01-list-admin", w);
});

test("a client sees only the launches that have been published", async ({ page }, info) => {
  const w = width(info.project.name);
  // The seed publishes neither, so a client's list is empty — which is
  // the honest state and the one worth photographing, because it is what
  // a client sees for most of a launch's life.
  await signIn(page, "client");
  await page.goto("/reporting/launches");

  await expect(page.getByText(/no launches yet/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Autumn challenge" })).toHaveCount(0);
  // And they are not invited to make one.
  await expect(page.getByText(/start one when there is something to plan/i)).toHaveCount(0);
  await shoot(page, TAB, "02-list-client-empty", w);
});

test("once published, the client sees it", async ({ page }, info) => {
  const w = width(info.project.name);
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`update public.report_launches l set published_at = now(),
         published_by = (select id from public.members where role = 'admin' limit 1)
        from public.report_workspaces w
       where w.id = l.workspace_id and w.business_name = 'Northwind Studio'
         and l.name = 'Autumn challenge';`);

  await signIn(page, "client");
  await page.goto("/reporting/launches");

  await expect(page.getByRole("link", { name: "Autumn challenge" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Spring relaunch" })).toHaveCount(0);
  await shoot(page, TAB, "03-list-client", w);
});

test("on a phone the sections are a picker, not a bar you have to scroll", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");

  const tabs = page.locator("nav[data-tabs]");

  if (w === "phone") {
    // Eleven tabs in a sideways scroller left the one you were on off
    // the screen — measured at 390px, and nothing would scroll it there.
    const summary = page.locator("[data-section-picker] > summary");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText(/Launches/);
    await expect(tabs).toBeHidden();
    await shoot(page, TAB, "04-sections-picker-admin", w);

    // It opens with no script, because it is a disclosure and not a menu.
    await summary.click();
    await expect(page.getByRole("link", { name: "Financials", exact: true })).toBeVisible();
    await shoot(page, TAB, "05-sections-picker-open", w);

    // And every entry is a real link.
    await page.getByRole("link", { name: "Financials", exact: true }).click();
    await page.waitForURL(/\/reporting\/financials/);
    await expect(page.locator("[data-section-picker] > summary")).toHaveText(/Financials/);
    await shoot(page, TAB, "06-sections-picker-moved", w);
  } else {
    // And on a laptop it is tabs, all of them on screen.
    await expect(tabs).toBeVisible();
    await expect(page.locator("[data-section-picker] > summary")).toBeHidden();
    await expect(tabs.getByRole("link").last()).toBeInViewport();
  }
});

test("the client gets the picker too, with only their own sections", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "client");
  await page.goto("/reporting");

  if (w === "phone") {
    const summary = page.locator("[data-section-picker] > summary");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText(/Overview/);
    await summary.click();
    // **Every section, Launches included.** A client gets the tab at
    // stage 4 — what they do not get is anybody else's launches, which
    // the page itself decides and the test above proves. An earlier
    // version of this assumed the tab was the team's and was simply
    // wrong about the product.
    await expect(page.getByRole("link", { name: "Financials", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Launches", exact: true })).toBeVisible();
    // The editor-only screens are not sections and never appear here.
    await expect(page.getByRole("link", { name: /^Targets$/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Benchmarks$/ })).toHaveCount(0);
    await shoot(page, TAB, "07-sections-picker-client", w);
  } else {
    await expect(page.locator("nav[data-tabs]")).toBeVisible();
  }
});

test("the launch report, end to end", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]+/);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  // §6.4's headline figures, from the seed's §6.6 numbers: 22 at £500 plus
  // 8 at £600 at full contract value, £12,600 collected.
  expect(text).toMatch(/TOTAL SALES 30/);
  expect(text).toMatch(/TOTAL REVENUE £15,800/);
  expect(text).toMatch(/STILL TO COLLECT £3,200/);
  // 15,800 ÷ 30.
  expect(text).toMatch(/AVERAGE ORDER VALUE £526\.67/);
  // 30 sales against the MAIN SELLING STAGE's 600 attendees, not the
  // challenge's 2,450 across five days — the thing that would read as 1%.
  expect(text).toMatch(/CONVERSION RATE 5\.0%/);

  // The three goals, and which stage the selling happened on.
  expect(text).toMatch(/Good 30 of 30\s*100%/);
  expect(text).toMatch(/Better 30 of 45\s*67%/);
  expect(text).toMatch(/Where the selling happened/);

  // A stage with one email has no line to read, so its dot carries the
  // number — the masterclass sent one, at 51%.
  expect(text).toMatch(/51%/);

  await shoot(page, TAB, "08-report-admin", w);
});

test("the planner reads §6.6's own worked example back", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // 30 sales at 5% is 600 live attendees; at 47% show-up that is 1,277
  // sign-ups. The brief says the approved mockup's 600 is wrong, and this
  // is the assertion that keeps us on the formula rather than the mockup.
  expect(text).toMatch(/LIVE ATTENDEES NEEDED 600/);
  expect(text).toMatch(/SIGN-UPS NEEDED 1,277/);
  await shoot(page, TAB, "09-planner", w);
});

test("the client sees a published launch's report and none of the planner", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`update public.report_launches l set published_at = now(),
         published_by = (select id from public.members where role = 'admin' limit 1)
        from public.report_workspaces w
       where w.id = l.workspace_id and w.business_name = 'Northwind Studio'
         and l.name = 'Autumn challenge';`);

  await signIn(page, "client");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toMatch(/TOTAL REVENUE £15,800/);
  // The planner is a planning tool for a conversation, not a number to
  // hand somebody — §6.6 is the team's.
  expect(text).not.toMatch(/Working backwards/);
  expect(text).not.toMatch(/SIGN-UPS NEEDED/);
  await shoot(page, TAB, "10-report-client", w);
});

test("one client cannot open another's launch", async ({ page }) => {
  // Not found and not yours are the same answer — §13: never confirm that
  // another client's record exists.
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const id = sql(`select l.id from public.report_launches l
                    join public.report_workspaces w on w.id = l.workspace_id
                   where w.business_name = 'Northwind Studio' and l.name = 'Autumn challenge';`)
    .trim()
    .split("\n")
    .pop();

  await signIn(page, "member");
  const response = await page.goto(`/reporting/launches/${id}`);
  expect(response?.status()).toBe(404);
});
