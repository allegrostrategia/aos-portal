import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Stages 3 to 6, together.
 *
 * Every other spec proves one stage at a time, on a server running at
 * the stage being built. This one walks the whole product with all of
 * them on, because that is what moving `PRODUCTION_STAGE` will do and
 * nothing has ever done it in one pass — a stage can be correct alone
 * and wrong beside the others.
 *
 * Both people and both widths: Nina, who enters a retainer client's
 * figures and publishes them, and a member, who enters their own.
 */

requireLocalStack();

const TAB = "walkthrough";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("Nina's whole month: enter, import, launches, publish", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  // Stage 2/3 — the Overview, with the panels and the traffic lights on.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.getByText(/still to fill in/i)).toBeVisible();
  await shoot(page, TAB, "01-overview-nina", w);

  // Stage 3 — a tab that only exists from Stage 3.
  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  await expect(page.getByText(/cost per lead/i).first()).toBeVisible();

  // Stage 6 — the upload card, on a Stage 3 screen.
  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);
  await expect(page.getByRole("heading", { name: /fill from a file/i })).toBeVisible();
  await shoot(page, TAB, "02-ads-entry-nina", w);

  // Stage 4 — Launches, with its own report.
  await page.goto(`/reporting/launches?month=${MONTHS.sep}`);
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]{36}/);
  await expect(page.getByText(/£15,800/).first()).toBeVisible();
  await shoot(page, TAB, "03-launch-report", w);

  // Stage 3's lock, on top of all of it: publishing, then read-only.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);
  await expect(
    page.getByRole("heading", { name: /fill from a file/i }),
    "a published month is not offered a file",
  ).toHaveCount(0);
  await shoot(page, TAB, "04-locked-entry", w);
});

test("a client reads the published month, and none of the team's half", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");

  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await signIn(page, "client");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

  expect(body, "their strategist's note is theirs").toMatch(/strategist/i);
  expect(body, "no upload card").not.toMatch(/fill from a file/i);
  expect(body, "nothing to publish").not.toMatch(/publish this month/i);
  expect(body, "no completion list").not.toMatch(/still to fill in/i);
  expect(body, "not a member's reflection").not.toMatch(/your reflection/i);
  await shoot(page, TAB, "05-overview-client", w);
});

test("a member's whole month, with every stage on", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "member");

  // Stage 5 — the way in, and the report settings.
  await page.goto("/you");
  await page.getByRole("link", { name: /your monthly report/i }).click();
  await page.waitForURL(/\/reporting/);
  await shoot(page, TAB, "06-member-overview", w);

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body, "their own reflection").toMatch(/your reflection/i);
  expect(body, "and no strategist").not.toMatch(/strategist/i);
  // Stage 6 is team-only on retainers, so a member never sees a card.
  expect(body, "no upload card for a member").not.toMatch(/fill from a file/i);

  await page.goto("/reporting/settings");
  await expect(page.getByRole("heading", { name: /the sections you use/i })).toBeVisible();
  await shoot(page, TAB, "07-member-settings", w);

  // Stage 3's tabs are theirs too, and Stage 4's launches.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  await page.getByLabel(/fixed costs/i).fill("300");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();
  await shoot(page, TAB, "08-member-entry", w);
});
