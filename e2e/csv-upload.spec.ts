import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Stage 6 — §10's CSV upload.
 *
 * The parser is unit-tested to death; these check the thing a unit test
 * cannot — that nobody is offered a button that will not work, and that
 * a figure somebody typed is never replaced without being shown.
 *
 * Both screens, and they import differently. Social Media takes account
 * totals straight into boxes. Ads cannot: the export is one row per
 * campaign and the screen stores per campaign, so every row has to find
 * the campaign it belongs to, matched by **exact name**, and a row with
 * no campaign is listed rather than created.
 */

requireLocalStack();

const TAB = "csv";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

/** Three posts in September, one in August, one in October. */
const CONTENT_CSV = `Post ID,Account username,Description,Publish time,Permalink,Post type,Views,Reach,Likes,Shares,Follows,Comments,Saves
1,allegro,"A post, with a comma",09/02/2026 08:00:00,https://x/1,Reel,4000,3000,200,20,5,30,40
2,allegro,"She said ""hello""",09/14/2026 09:00:00,https://x/2,Reel,3000,2500,150,10,3,20,25
3,allegro,Another,09/28/2026 10:00:00,https://x/3,Image,2000,1500,100,5,2,10,15
4,allegro,Last month,08/20/2026 10:00:00,https://x/4,Image,9999,9999,999,99,99,99,99
5,allegro,Next month,10/02/2026 10:00:00,https://x/5,Image,8888,8888,888,88,88,88,88
`;

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

const upload = (page: import("@playwright/test").Page, body: string, name = "content.csv") =>
  page.setInputFiles("input[type=file]", {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body),
  });

const social = async (page: import("@playwright/test").Page) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
};

test("a file fills the boxes, and still nothing is saved", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await social(page);

  await expect(page.getByRole("heading", { name: /fill from a file/i })).toBeVisible();
  await shoot(page, TAB, "01-card", w);

  await upload(page, CONTENT_CSV);
  await expect(page.getByText(/3 rows used/i)).toBeVisible();
  await expect(page.getByText(/2 skipped/i)).toBeVisible();
  await shoot(page, TAB, "02-preview", w);

  // A preview is not a fill: the boxes are still as they were.
  await expect(page.getByLabel(/^Views/i).first()).toHaveValue("");

  await page.getByRole("button", { name: /fill these in/i }).click();
  await expect(page.getByLabel(/^Views/i).first()).toHaveValue("9000");
  await expect(page.getByLabel(/^Posts published/i).first()).toHaveValue("3");

  // And a fill is not a save.
  await page.reload();
  await expect(page.getByLabel(/^Views/i).first()).toHaveValue("");
});

test("a figure already in the box is shown old → new, never replaced unseen", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await social(page);

  // Somebody has typed a corrected figure. Compared against the box as
  // it stands, not against what was last saved — which is the same
  // thing on load and the honest thing mid-edit.
  await page.getByLabel(/^Views/i).first().fill("8500");
  await upload(page, CONTENT_CSV);

  const changed = page.locator("[data-csv-changed]");
  await expect(changed).toContainText(/1 figure already here would change/i);
  await expect(changed).toContainText(/8500/);
  await expect(changed).toContainText(/9000/);
  await shoot(page, TAB, "03-would-change", w);

  // Their figure is still theirs until they say otherwise.
  await expect(page.getByLabel(/^Views/i).first()).toHaveValue("8500");

  // And only when they do.
  await page.getByRole("button", { name: /fill these in/i }).click();
  await expect(page.getByLabel(/^Views/i).first()).toHaveValue("9000");
});

test("a file with nothing in this month says so, rather than filling zeros", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await social(page);

  await upload(page, CONTENT_CSV.split("\n").filter((l, i) => i === 0 || l.includes("07/")).join("\n")
    || "Post ID,Publish time,Views,Likes,Comments,Shares,Follows,Saves\n1,07/02/2026,100,1,1,1,1,1\n");
  await expect(page.locator("[data-csv-problem]")).toBeVisible();
  await shoot(page, TAB, "04-nothing-this-month", w);
  await expect(page.getByRole("button", { name: /fill these in/i })).toHaveCount(0);
});

test("the wrong file names the screen it belongs on", async ({ page }) => {
  await signIn(page, "nina");
  await social(page);

  await upload(
    page,
    'Campaign name,Amount spent (GBP),Impressions\n"Leads, UK",400.00,40000\n',
    "ads.csv",
  );
  await expect(page.locator("[data-csv-problem]"))
    .toContainText(/ads figures go on the Ads screen/i);
  await expect(page.getByRole("button", { name: /fill these in/i })).toHaveCount(0);
});

test("a published month is not offered a file at all", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  // August is published in the seed, so its figures do not change — and
  // a card that could only ever refuse is not shown (Dom, 9 October).
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.aug}`);
  await expect(page.getByRole("heading", { name: /fill from a file/i })).toHaveCount(0);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await shoot(page, TAB, "05-locked", w);
});

test("a client is never offered one, and nor is a member", async ({ page }) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  // A retainer client does not enter figures at all.
  await signIn(page, "client");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await expect(page.locator("input[type=file]")).toHaveCount(0);

  // And a member fills Meta in by hand for now — Nina's decision 34.
  await signIn(page, "member");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await expect(page.getByRole("heading", { name: /fill from a file/i })).toHaveCount(0);
});



/**
 * §10.2's import, which is not "fill these boxes": the export is one
 * row per campaign and this screen stores per campaign, so every row
 * has to find the campaign it belongs to.
 */
const ADS_CSV = `Campaign name,Campaign delivery,Amount spent (GBP),Impressions,Link clicks,Leads,Result indicator,Results,Reporting starts,Reporting ends
Spring leads,active,400.00,40000,2700,60,actions:onsite_conversion.lead_grouped,60,2026-09-01,2026-09-30
"Brand, reels",active,200.00,20000,1500,0,actions:profile_visit,1500,2026-09-01,2026-09-30
Paused,inactive,0,0,0,0,,0,2026-09-01,2026-09-30
`;

const ads = async (page: import("@playwright/test").Page) => {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);
};

/** The seed's campaigns, so a row can be made to match one. */
const renameFirstCampaignTo = async (name: string) => {
  const { RETAINER, sql } = await import("../scripts/seed-test-db.mjs");
  const ws = sql(`select id from public.report_workspaces where business_name = '${RETAINER}'`);
  const id = sql(`select id from public.report_entities
                   where workspace_id = '${ws}' and entity_type = 'ad_campaign'
                   order by name limit 1`);
  sql(`update public.report_entities set name = '${name}' where id = '${id}';`);
  return id;
};

test("a row matching a campaign by name fills that campaign, old → new", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const id = await renameFirstCampaignTo("Spring leads");

  await signIn(page, "nina");
  await ads(page);
  await page.setInputFiles("input[type=file]", {
    name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(ADS_CSV),
  });

  await expect(page.getByText(/1 matched, 1 not recognised/i)).toBeVisible();
  await expect(page.locator("[data-csv-matched]")).toContainText(/Spring leads/);
  await shoot(page, TAB, "06-ads-preview", w);

  await page.getByRole("button", { name: /fill these in/i }).click();
  // Scoped to that campaign's own box: the seed has several and the
  // first on screen is somebody else's.
  await expect(page.locator(`input[name="v:ads_spend:${id}"]`)).toHaveValue("400");
});

test("a row with no campaign is listed, and nothing is created unless ticked", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { RETAINER, sql } = await import("../scripts/seed-test-db.mjs");
  const id = await renameFirstCampaignTo("Spring leads");
  const ws = sql(`select id from public.report_workspaces where business_name = '${RETAINER}'`);
  const campaignCount = () =>
    Number(sql(`select count(*)::text from public.report_entities
                 where workspace_id = '${ws}' and entity_type = 'ad_campaign'`));
  const before = campaignCount();

  await signIn(page, "nina");
  await ads(page);
  await page.setInputFiles("input[type=file]", {
    name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(ADS_CSV),
  });

  const unmatched = page.locator("[data-csv-unmatched]");
  await expect(unmatched).toContainText(/Brand, reels/);
  await expect(unmatched).toContainText(/nothing is added unless you tick it/i);
  await shoot(page, TAB, "07-ads-unmatched", w);

  // Left unticked: filling makes nothing.
  await page.getByRole("button", { name: /fill these in/i }).click();
  await expect(page.locator(`input[name="v:ads_spend:${id}"]`)).toHaveValue("400");
  expect(campaignCount(), "nothing was created").toBe(before);
});

test("a ticked campaign is created by the save, not before it", async ({ page }) => {
  // **All or nothing** (Dom, 12 Oct). It used to be created the moment
  // somebody pressed "Fill these in", which left an empty campaign
  // behind if they changed their mind — and an empty campaign is not
  // harmless: it renders as a row on the client's published report,
  // with dashes where its figures would be. Measured, not assumed.
  const { RETAINER, sql } = await import("../scripts/seed-test-db.mjs");
  await renameFirstCampaignTo("Spring leads");
  const ws = sql(`select id from public.report_workspaces where business_name = '${RETAINER}'`);
  const names = () =>
    sql(`select coalesce(string_agg(name, ' | ' order by name), '') from public.report_entities
          where workspace_id = '${ws}' and entity_type = 'ad_campaign'`);

  await signIn(page, "nina");
  await ads(page);
  await page.setInputFiles("input[type=file]", {
    name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(ADS_CSV),
  });

  await page.getByRole("checkbox", { name: /Add Brand, reels as a new campaign/i }).check();
  await page.getByRole("button", { name: /fill these in/i }).click();

  // Filling does not create it. It is waiting on the save.
  await expect(page.locator("[data-pending-campaigns]")).toContainText(/Brand, reels/);
  expect(names(), "nothing is created by filling").not.toContain("Brand, reels");

  // The month form's own save — this screen has several forms, and
  // `.first()` was the campaign-name one.
  await page.getByRole("button", { name: /save this month/i }).click();
  await expect
    .poll(() => names(), { message: "the save never created it" })
    .toContain("Brand, reels");
  expect(names().match(/Brand, reels/g) ?? []).toHaveLength(1);
});

test("abandoning the preview leaves nothing behind", async ({ page }) => {
  const { RETAINER, sql } = await import("../scripts/seed-test-db.mjs");
  await renameFirstCampaignTo("Spring leads");
  const ws = sql(`select id from public.report_workspaces where business_name = '${RETAINER}'`);
  const count = () =>
    Number(sql(`select count(*)::text from public.report_entities
                 where workspace_id = '${ws}' and entity_type = 'ad_campaign'`));
  const before = count();

  await signIn(page, "nina");
  await ads(page);
  await page.setInputFiles("input[type=file]", {
    name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(ADS_CSV),
  });
  await page.getByRole("checkbox", { name: /Add Brand, reels as a new campaign/i }).check();
  await page.getByRole("button", { name: /fill these in/i }).click();
  await expect(page.locator("[data-pending-campaigns]")).toBeVisible();

  // Changed their mind, and left.
  await page.getByRole("button", { name: /not this one/i }).click();
  await expect(page.locator("[data-pending-campaigns]")).toHaveCount(0);
  await ads(page);

  expect(count(), "nothing was left behind").toBe(before);
});

test("a campaign the file is silent about keeps what is in it", async ({ page }) => {
  await renameFirstCampaignTo("Spring leads");
  await signIn(page, "nina");
  await ads(page);
  await page.setInputFiles("input[type=file]", {
    name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(ADS_CSV),
  });
  // The seed has more than one campaign, and the file names one of them.
  await expect(page.locator("[data-csv-untouched]")).toContainText(/says nothing about/i);
});
