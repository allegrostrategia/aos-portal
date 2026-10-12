import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Stage 6 — §10's CSV upload.
 *
 * The parser is unit-tested to death; these check the thing a unit test
 * cannot — that nobody is offered a button that will not work, and that
 * a figure somebody typed is never replaced without being shown.
 *
 * **Social Media only, for now.** The Ads entry screen stores per
 * campaign and the ads export is one row per campaign, so filling it
 * means matching rows to campaigns by name rather than handing over
 * account totals. That is a different shape of import, and it is a
 * decision rather than wiring — see the `fixme` at the bottom.
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
 * **Ads is not wired, and it is a decision rather than wiring.**
 *
 * §10.2's export is one row per campaign, and the Ads entry screen
 * stores per campaign too — `ads_spend|<campaign id>`, not one account
 * total. So an import has to match each row to a campaign by name and
 * say what to do about rows for campaigns that do not exist yet, which
 * is a different shape from "fill these boxes".
 *
 * The parser already reads the rows; what is missing is the decision.
 * Left failing-by-name rather than quietly absent.
 */
test.fixme("the ads export fills each campaign, matched by name", async () => {});
