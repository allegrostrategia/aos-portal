import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * What a second social platform does today: nothing (Dom, 4 November).
 *
 * Nina has asked for a target per platform — Instagram, LinkedIn and
 * TikTok each judged separately. The first question is what the build
 * already does, and the answer is easier to see than to describe, so
 * this spec makes the state Nina is asking about and photographs it.
 *
 * One platform row is created on the first save of any Social Media
 * figure, named "Instagram" (`ensurePrimaryPlatform`). Nothing in the
 * app can add a second, so this one does it in SQL — which is the only
 * way it could happen — and then shows that the report and the entry
 * screen carry on as if it were not there: no picker, no second set of
 * boxes, and the platform's name nowhere on either screen.
 *
 * It is a record of a limitation, not a wish: when the per-platform
 * work is built, this spec is what should start failing.
 */

requireLocalStack();

const TAB = "platforms";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  // The seed enters no Social Media figures, so this makes the state
  // Nina is describing: two platforms, each with its own month. The
  // second one is inserted in SQL because there is no other way to make
  // one — nothing in the app creates a platform but the first save,
  // which always names it Instagram.
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

test("a second platform exists in the data and nowhere on the screen", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);
  const report = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(report, "no platform is named on the report").not.toMatch(/LinkedIn|Instagram/i);
  // Instagram's 26,420 followers are on the page; LinkedIn's 3,120 are
  // in the database and on no screen anywhere.
  expect(report, "the first platform's figures").toContain("26,420");
  expect(report, "and only the first platform's").not.toContain("3,120");
  await shoot(page, TAB, "01-report-two-platforms", w);

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  const entry = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(entry, "nor on the entry screen").not.toMatch(/LinkedIn|Instagram/i);
  // One set of boxes, not two: "Followers at month end" is asked once.
  await expect(page.getByText("Followers at month end")).toHaveCount(1);
  await shoot(page, TAB, "02-entry-two-platforms", w);
});
