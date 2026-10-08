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
