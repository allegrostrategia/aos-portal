import { mkdirSync } from "node:fs";

import { type Page } from "@playwright/test";
import { test } from "./quiet.ts";

import { capture, requireLocalStack, signIn } from "./helpers.ts";

/**
 * Every report page, both widths, against the demo client's full year.
 *
 * **For Nina to look through beside her mock-ups**, not for an
 * assertion to pass. The screen sweep walks the seeded test data, which
 * is two months and mostly empty; this walks "Demo – Lemon Studio",
 * which has thirteen months on it, so every chart has something to
 * draw and the year grid is full rather than eleven dashes.
 *
 * October, because it is the fullest published month: the current one
 * is still a draft and a client would not see it.
 */

requireLocalStack();

const FOLDER = "docs/nina-review/visual-rebuild";
const MONTH = "2026-10";

const shoot = async (page: Page, name: string, width: string) => {
  mkdirSync(FOLDER, { recursive: true });
  await capture(page, `${FOLDER}/${name}-${width}.png`);
};

const PAGES: [string, string][] = [
  ["01-overview", ""],
  ["02-social-media", "/social-media"],
  ["03-trial-reels", "/trial-reels"],
  ["04-email", "/email"],
  ["05-funnels", "/funnels"],
  ["06-leads-conversions", "/leads-conversions"],
  ["07-ads", "/ads"],
  ["08-client-experience", "/client-experience"],
  ["09-offers", "/offers"],
  ["10-financials", "/financials"],
  ["11-launches", "/launches"],
];

test("the demo client's report, page by page", async ({ page }, info) => {
  const width = info.project.name === "phone" ? "phone" : "desktop";
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const workspace = sql(
    `select id from public.report_workspaces where business_name = 'Demo – Lemon Studio' limit 1;`,
  ).trim();
  test.skip(workspace === "", "the demo workspace is not seeded locally");

  await signIn(page, "nina");
  for (const [name, path] of PAGES) {
    await page.goto(`/reporting${path}?workspace=${workspace}&month=${MONTH}`);
    await page.getByRole("heading").first().waitFor();
    await shoot(page, name, width);
  }

  // And the document a client downloads.
  await page.goto(`/reporting/print?workspace=${workspace}&month=${MONTH}`);
  await page.getByRole("heading").first().waitFor();
  await shoot(page, "12-print", width);
});
