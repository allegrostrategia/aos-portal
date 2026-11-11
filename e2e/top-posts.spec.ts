import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * The month's top posts, per platform (Nina, 11 November).
 *
 * "Top performing posts matters more than the overall stats, because it
 * shows clients what style of post to make next month."
 *
 * Two routes in, and both are here: Instagram's three come out of the
 * Meta content export the client already uploads, and LinkedIn's are
 * typed. **No captions, by Nina's decision of 11 November** — the link
 * opens the post — which is the one thing a unit test cannot check on
 * the rendered page, so it is checked here on the client's own view.
 */

requireLocalStack();

const TAB = "top-posts";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

/** Three posts in September, one in August that did far better. */
const CONTENT_CSV = `Post ID,Account username,Description,Publish time,Permalink,Post type,Views,Reach,Likes,Shares,Follows,Comments,Saves
1,allegro,"The caption nobody should ever see",09/02/2026 08:00:00,https://example.test/p/one,Reel,4000,3000,200,20,5,30,40
2,allegro,"She said ""hello""",09/14/2026 09:00:00,https://example.test/p/two,Carousel,3000,2500,150,10,3,20,25
3,allegro,Another,09/28/2026 10:00:00,https://example.test/p/three,Image,2000,1500,100,5,2,10,15
4,allegro,Last month,08/20/2026 10:00:00,https://example.test/p/old,Image,9999,9999,999,99,99,99,99
`;

test.beforeEach(async () => {
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  sql(`insert into public.report_entities (workspace_id, entity_type, name, sort_order)
       select id, 'social_platform', 'Instagram', 1 from public.report_workspaces
        where business_name = 'Northwind Studio';
       insert into public.report_entities (workspace_id, entity_type, name, sort_order)
       select id, 'social_platform', 'LinkedIn', 2 from public.report_workspaces
        where business_name = 'Northwind Studio';`);
});

test("the Meta file fills the top three, and the client reads them as links", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await page.setInputFiles("input[type=file]", {
    name: "content.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CONTENT_CSV),
  });

  const card = page.locator("section", { hasText: "Top posts this month" }).first();
  await expect(card.getByText(/The file has 3 posts/i)).toBeVisible();
  await card.getByRole("button", { name: /fill these in/i }).click();

  // Ranked by reach: 3,000 then 2,500 then 1,500 — and August's 9,999
  // is not in a September list however well it did.
  await expect(page.locator('input[name="post:1:url"]')).toHaveValue(
    "https://example.test/p/one",
  );
  await expect(page.locator('input[name="post:1:reach"]')).toHaveValue("3000");
  await expect(page.locator('input[name="post:3:url"]')).toHaveValue(
    "https://example.test/p/three",
  );
  const filled = (await card.innerText()).replace(/\s+/g, " ");
  expect(filled, "August's post is not in September's list").not.toContain("p/old");

  await shoot(page, TAB, "01-entry-filled", w);

  await card.getByRole("button", { name: /save top posts/i }).click();
  await expect(page.getByText(/Top posts saved/i)).toBeVisible();

  // The figures from the same file, so the month has something in it
  // besides the posts — which is what a real month looks like.
  const upload = page.locator("section", { hasText: "Fill from a file" }).first();
  await upload.getByRole("button", { name: /fill these in/i }).click();
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/Social Media is up to date/i)).toBeVisible();

  // Published, then read as the client reads it.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await signIn(page, "client");
  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);

  const report = page.locator("section", { hasText: "Top posts this month" }).first();
  await expect(report).toBeVisible();
  const first = report.getByRole("link").first();
  await expect(first).toHaveAttribute("href", "https://example.test/p/one");
  // A link that opens somewhere else gets no handle on this page, and
  // where a client reads their report is nobody else's business.
  await expect(first).toHaveAttribute("rel", /noopener/);
  await expect(first).toHaveAttribute("rel", /noreferrer/);
  // With no caption to use, the link's own words are the kind of post
  // and the day it went out.
  await expect(first).toHaveText("Reel, 2 Sept");

  // **The decision, checked on the page a client actually sees.**
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(body, "no caption, anywhere").not.toContain("The caption nobody should ever see");
  expect(body, "nor the second one").not.toContain("She said");
  expect(body).toContain("Carousel, 14 Sept");

  await shoot(page, TAB, "02-report-client", w);
});

test("LinkedIn's are typed, on its own tab", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await page.getByText("Instagram", { exact: true }).first().click();
  await page.getByRole("link", { name: "LinkedIn" }).click();
  await page.waitForURL(/platform=/);

  const card = page.locator("section", { hasText: "Top posts this month" }).first();
  await expect(card).toContainText("LinkedIn");
  // No Meta export for LinkedIn, so no file is offered for its posts.
  await expect(card.getByRole("button", { name: /fill these in/i })).toHaveCount(0);

  await page.locator('input[name="post:1:url"]').fill("https://example.test/in/one");
  await page.locator('input[name="post:1:reach"]').fill("14200");
  await page.locator('select[name="post:1:post_type"]').selectOption("photo");
  await page.locator('input[name="post:1:posted_on"]').fill("2026-09-09");
  await card.getByRole("button", { name: /save top posts/i }).click();
  await expect(page.getByText(/Top posts saved/i)).toBeVisible();

  await shoot(page, TAB, "03-entry-linkedin", w);

  // And it is LinkedIn's list, not Instagram's.
  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);
  await expect(page.getByText("Top posts this month")).toHaveCount(0);
});

test("a link that is not a link is refused", async ({ page }) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  const card = page.locator("section", { hasText: "Top posts this month" }).first();
  await page.locator('input[name="post:1:url"]').fill("javascript:alert(1)");
  await card.getByRole("button", { name: /save top posts/i }).click();
  await expect(page.getByText(/should start with https/i)).toBeVisible();
});

/**
 * Trial Reels' "What worked this month" takes a link too.
 *
 * Nina, 11 November, and the same argument: a hook written down is a
 * line somebody then has to go and find.
 */
test("a hook can carry a link, and the client can watch it", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);
  await page.locator('input[name="item:hook:1:body"]').fill("The one about pricing");
  await page.locator('input[name="item:hook:1:url"]').fill("https://example.test/reel/1");
  await page.locator('input[name="item:hook:1:views"]').fill("18400");
  await page.getByRole("button", { name: /save what worked/i }).click();
  await expect(page.getByText(/Trial Reels is up to date/i)).toBeVisible();
  await shoot(page, TAB, "04-trial-reels-entry", w);

  await page.goto(`/reporting/trial-reels?month=${MONTHS.sep}`);
  const hook = page.getByRole("link", { name: "The one about pricing" });
  await expect(hook).toHaveAttribute("href", "https://example.test/reel/1");
  await expect(hook).toHaveAttribute("rel", /noopener/);
  await shoot(page, TAB, "05-trial-reels-report", w);

  // A hook with no link is still a hook, not a dead anchor.
  await page.goto(`/reporting/enter/trial-reels?month=${MONTHS.sep}`);
  await page.locator('input[name="item:hook:2:body"]').fill("The one with no link");
  await page.getByRole("button", { name: /save what worked/i }).click();
  await expect(page.getByText(/Trial Reels is up to date/i)).toBeVisible();

  await page.goto(`/reporting/trial-reels?month=${MONTHS.sep}`);
  await expect(page.getByText("The one with no link")).toBeVisible();
  await expect(page.getByRole("link", { name: "The one with no link" })).toHaveCount(0);
});
