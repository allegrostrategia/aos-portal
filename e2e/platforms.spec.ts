import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * More than one social platform (§5.2, built 11 November).
 *
 * **This spec used to assert the opposite**, and that was the point of
 * writing it: on 4 November it photographed a second platform being
 * stored and shown nowhere, because every reader took
 * `entities.find(social_platform)` — the first by sort order. Nina asked
 * for Instagram, LinkedIn and TikTok each with their own figures and
 * their own targets, and the note on the old spec said it was what
 * should start failing when that was built. It did.
 *
 * What it asserts now is the pill: each platform's figures are its own,
 * the Overview shows the main one and says whose it is, and a section is
 * finished only when every platform is.
 */

requireLocalStack();

const TAB = "platforms";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

const platform = (name: string, order: number) =>
  `insert into public.report_entities (workspace_id, entity_type, name, sort_order)
   select id, 'social_platform', '${name}', ${order} from public.report_workspaces
    where business_name = 'Northwind Studio';`;

const figure = (platformName: string, month: string, key: string, value: number) =>
  `insert into public.report_values (workspace_id, month, metric_key, entity_id, value)
   select e.workspace_id, '${month}-01', '${key}', e.id, ${value}
     from public.report_entities e
     join public.report_workspaces w on w.id = e.workspace_id
    where w.business_name = 'Northwind Studio'
      and e.entity_type = 'social_platform' and e.name = '${platformName}';`;

test.beforeEach(async () => {
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  // The seed enters no Social Media figures, so this makes the state
  // Nina described: two platforms, each with its own month.
  sql(`
    ${platform("Instagram", 1)}
    ${platform("LinkedIn", 2)}
    ${figure("Instagram", MONTHS.aug, "social_media_followers_at_month_end", 24650)}
    ${figure("Instagram", MONTHS.sep, "social_media_followers_at_month_end", 26420)}
    ${figure("Instagram", MONTHS.sep, "social_media_posts_published", 22)}
    ${figure("Instagram", MONTHS.sep, "social_media_reach", 184500)}
    ${figure("Instagram", MONTHS.sep, "social_media_views", 212000)}
    ${figure("Instagram", MONTHS.sep, "social_media_likes_plus_comments", 11400)}
    ${figure("Instagram", MONTHS.sep, "social_media_saves", 3100)}
    ${figure("Instagram", MONTHS.sep, "social_media_shares", 1450)}
    ${figure("LinkedIn", MONTHS.aug, "social_media_followers_at_month_end", 2840)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_followers_at_month_end", 3120)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_posts_published", 9)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_reach", 14200)}
  `);
});

test("the pill switches platform, and each one's figures are its own", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);
  // The main platform by default: the first by sort order, which is the
  // one the Overview reads too.
  await expect(page.getByText("26,420")).toBeVisible();
  await shoot(page, TAB, "01-report-instagram", w);

  await page.getByText("Instagram", { exact: true }).first().click();
  await page.getByRole("link", { name: "LinkedIn" }).click();
  await page.waitForURL(/platform=/);

  const linkedIn = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(linkedIn, "LinkedIn's own followers").toContain("3,120");
  expect(linkedIn, "and not Instagram's").not.toContain("26,420");
  expect(linkedIn, "nor Instagram's reach").not.toContain("184,500");
  expect(linkedIn, "LinkedIn's reach").toContain("14,200");

  // Reloaded before the picture only so the open menu is not covering
  // the tabs in it: the pill is a <details>, and following a link inside
  // one is a soft navigation, which leaves the DOM — and the open menu —
  // where it was. The month picker has always done the same.
  await page.reload();
  await shoot(page, TAB, "02-report-linkedin", w);
});

test("the Overview shows the main platform, and says which one", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const followers = page.locator('[data-kpi="Followers"]');
  await expect(followers).toContainText("26,420");
  // **Named, never summed.** 26,420 + 3,120 would count anybody who
  // follows them in both places twice, which is the mistake §10.1
  // already refuses for reach.
  await expect(followers).toContainText("on Instagram");
  await expect(followers).not.toContainText("29,540");

  await shoot(page, TAB, "03-overview-main-platform", w);
});

test("a section is finished only when every platform is", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  // Instagram has all seven core figures; LinkedIn has three of them.
  // Before today this read as finished the moment Instagram was done.
  const marker = page.locator('[data-section="social_media"]');
  await expect(marker).toHaveAttribute("data-state", "started");

  await shoot(page, TAB, "04-entry-platforms", w);
});

test("a platform is added, renamed and retired, and nothing is deleted", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  await page.getByRole("button", { name: /add a platform/i }).click();
  await page.getByLabel(/add a platform/i).fill("TikTok");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/TikTok added/i)).toBeVisible();

  // It joins the pill, after the two that were there first.
  await page.reload();
  await expect(page.getByLabel(/What TikTok is called/i)).toBeVisible();

  // Renaming keeps the row — and therefore every figure on it.
  await page.getByLabel(/What TikTok is called/i).fill("TikTok UK");
  await page
    .locator("form", { has: page.getByLabel(/What TikTok is called/i) })
    .getByRole("button", { name: "Rename" })
    .click();
  await expect(page.getByText(/Renamed to TikTok UK/i)).toBeVisible();

  await shoot(page, TAB, "05-platforms-card", w);
});

test("the last live platform cannot be retired", async ({ page }) => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  // Down to one: Social Media's figures have to belong to something.
  sql(`update public.report_entities set active = false
        where entity_type = 'social_platform' and name = 'LinkedIn';`);

  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  // With one platform there is no Retire button at all — the refusal is
  // in the action as well, for the form posted by hand.
  await expect(page.getByRole("button", { name: "Retire" })).toHaveCount(0);
  await expect(page.getByText("Retired")).toBeVisible();
});

/**
 * A target per platform (Nina, 11 November).
 *
 * The screen that sets them offered none at all for Social Media before
 * today: it filtered to figures with no entity type, and every social
 * figure hangs off a platform. So this walks the whole way — set it,
 * then read it on the Overview, where it has to say whose target it is.
 */
test("a target can be set per platform, and the Overview names it", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/targets?month=${MONTHS.sep}`);
  const linkedInPosts = page.getByLabel("Posts published on LinkedIn");
  await expect(linkedInPosts, "a row per platform, named").toBeVisible();
  await linkedInPosts.fill("12");
  await page.getByLabel("Posts published on Instagram").fill("20");
  await page.getByRole("button", { name: /save targets/i }).click();
  await expect(page.getByText(/targets saved/i)).toBeVisible();
  await shoot(page, TAB, "06-targets-per-platform", w);

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const bars = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Nine of twelve on LinkedIn, twenty-two of twenty on Instagram: two
  // separate pieces of news about the same figure.
  expect(bars).toContain("Posts published on LinkedIn");
  expect(bars).toContain("9 of 12");
  expect(bars).toContain("Posts published on Instagram");
  expect(bars).toContain("22 of 20");

  await shoot(page, TAB, "07-overview-target-bars", w);
});
