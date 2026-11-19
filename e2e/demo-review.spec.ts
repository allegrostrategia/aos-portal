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

/**
 * The launch itself, which Nina asked to see on 19 November.
 *
 * **Nobody had ever looked at this page with real data on it.** The
 * sweep above photographs the launches LIST; the launch's own page was
 * never in it, and the demo's figures were all keyed at launch level —
 * so it had no funnel, no email chart, no price-option sales and four
 * dashes where its headline figures belong. Her item 0, found by
 * comparing the page's reads against what the seed wrote rather than by
 * any test.
 *
 * Two launches, because they are different states: one completed and
 * published, one still running — and the running one carries the "these
 * figures are still moving" banner and a plan it is behind.
 */
test("the demo's launches, page by page", async ({ page }, info) => {
  const width = info.project.name === "phone" ? "phone" : "desktop";
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const workspace = sql(
    `select id from public.report_workspaces where business_name = 'Demo – Lemon Studio' limit 1;`,
  ).trim();
  test.skip(workspace === "", "the demo workspace is not seeded locally");

  const launches = sql(
    `select l.id || ' ' || l.status
       from public.report_launches l
      where l.workspace_id = '${workspace}' and l.status <> 'planning'
      order by l.created_at;`,
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/) as [string, string]);

  await signIn(page, "nina");
  let n = 0;
  for (const [id, status] of launches) {
    n += 1;
    await page.goto(`/reporting/launches/${id}?workspace=${workspace}&month=${MONTH}`);
    await page.getByRole("heading").first().waitFor();
    await shoot(page, `14-${n}-launch-${status}`, width);

    // And the screen it is typed into, which is where the three new
    // lists are filled in.
    await page.goto(
      `/reporting/launches/${id}/enter?workspace=${workspace}&month=${MONTH}`,
    );
    await page.getByRole("heading").first().waitFor();
    await shoot(page, `14-${n}-launch-${status}-entry`, width);
  }
});

/**
 * Social Media on each of the four, which is the picture §5.2 is for.
 *
 * One page photographed four times: the same month, the same client,
 * four platforms, and the boxes, the cards, the charts, the words and
 * the kinds of post are different on every one. Before 17 November
 * these four were identical but for their numbers.
 *
 * Nina's document asked for exactly this ("screenshots of Social Media
 * on every platform"), and it is also the only check on the demo data
 * that a person can do: the tests below say LinkedIn's figures exist,
 * not that a LinkedIn page reads like LinkedIn.
 */
test("Social Media, on each kind of platform", async ({ page }, info) => {
  const width = info.project.name === "phone" ? "phone" : "desktop";
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const workspace = sql(
    `select id from public.report_workspaces where business_name = 'Demo – Lemon Studio' limit 1;`,
  ).trim();
  test.skip(workspace === "", "the demo workspace is not seeded locally");

  const platforms = sql(
    `select e.id || ' ' || e.platform_kind
       from public.report_entities e
      where e.workspace_id = '${workspace}' and e.entity_type = 'social_platform'
      order by e.sort_order;`,
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/) as [string, string]);

  await signIn(page, "nina");
  let n = 0;
  for (const [id, kind] of platforms) {
    n += 1;
    await page.goto(
      `/reporting/social-media?workspace=${workspace}&month=${MONTH}&platform=${id}`,
    );
    await page.getByRole("heading", { name: "Social Media" }).waitFor();
    await shoot(page, `13-${n}-social-${kind}`, width);
  }
});
