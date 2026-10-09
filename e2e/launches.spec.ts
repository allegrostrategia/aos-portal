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

test("setting a launch up, start to finish", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");

  await page.getByRole("link", { name: "+ New launch" }).click();
  await page.waitForURL(/\/reporting\/launches\/new/);
  await shoot(page, TAB, "11-new-launch", w);

  await page.getByLabel("Name", { exact: true }).fill("Winter intensive");
  await page.getByLabel(/^Description/).fill("Two weeks, one workshop");
  await page.getByLabel(/^good$/i).fill("20");
  await page.getByLabel(/^better$/i).fill("30");
  await page.getByLabel(/^best$/i).fill("40");
  await page.getByLabel(/show-up rate/i).fill("47");
  await page.getByLabel(/conversion rate/i).fill("5");
  await page.getByRole("button", { name: /create this launch/i }).click();

  // It lands on the setup screen, because a stage needs a launch to
  // belong to.
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]+\/edit/);
  await expect(page.getByText(/the stages, in order/i)).toBeVisible();
  await shoot(page, TAB, "12-edit-empty", w);

  // Two blank rows are already there — no "add" button to hydrate first.
  await page.getByLabel(/^Stage 1/).fill("The workshop");
  await page.getByRole("button", { name: /save the stages/i }).click();
  // The banner, not an inline message: the save redirects to `?saved=`
  // so the sentence is in the HTML rather than in a form's state.
  await expect(page.locator("[data-saved]")).toHaveText("Stages saved.");

  // And a price option.
  await page.getByLabel(/^Name — empty it/).first().fill("Pay in full");
  await page.getByLabel(/^Price$/).first().fill("400");
  await page.getByRole("button", { name: /save the prices/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Price options saved.");
  await shoot(page, TAB, "13-edit-filled", w);

  // The goals it was given are on its report.
  await page.getByRole("link", { name: /see the report/i }).click();
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]+(\?|$)/);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toMatch(/Good — of 20/);
  expect(text).toMatch(/The workshop/);
});

test("goals that do not go up are refused in her words", async ({ page }) => {
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.getByRole("link", { name: /edit launch details/i }).click();

  await page.getByLabel(/^good$/i).fill("60");
  await page.getByLabel(/^better$/i).fill("45");
  await page.getByLabel(/^best$/i).fill("30");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/go up in that order/i)).toBeVisible();
});

test("a published launch's setup is read-only, except its status", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();

  await page.getByRole("button", { name: /^publish this launch$/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await page.getByRole("link", { name: /edit launch details/i }).click();
  await expect(page.getByText(/has gone out/i)).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel(/^Stage 1/)).toBeDisabled();
  await expect(page.getByRole("button", { name: /save the stages/i })).toBeDisabled();

  // Decision 15: the status still moves, because it describes the launch
  // rather than the report. A disabled fieldset disables every
  // descendant, so this only works because the field sits outside it.
  const status = page.getByRole("combobox", { name: "Status", exact: true });
  await expect(status).toBeEnabled();
  await status.selectOption("completed");
  await page.getByRole("button", { name: /save the status/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Status saved.");
  await shoot(page, TAB, "14-edit-locked", w);
});

test("typing a launch's figures in, and seeing them on its report", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.getByRole("link", { name: /^enter data$/i }).click();
  await page.waitForURL(/\/enter/);

  // A box per stage, per day, per email, per price option — all four of
  // the contexts a launch figure can hang off, on one screen.
  await expect(page.getByText(/^Five day challenge$/)).toBeVisible();
  await expect(page.getByText(/^Day 5$/)).toBeVisible();
  await expect(page.getByText(/^Email 1$/).first()).toBeVisible();
  await shoot(page, TAB, "15-enter-admin", w);

  await page.getByLabel("Replay watchers", { exact: true }).first().fill("310");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  // And it is there when the screen comes back — which is also the one
  // check that a box's name and its lookup still agree. Name them
  // differently and this is what fails.
  await page.reload();
  await expect(page.getByLabel("Replay watchers", { exact: true }).first()).toHaveValue("310");
});

test("a launch with no stages says where its figures would go", async ({ page }) => {
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Spring relaunch" }).click();
  await page.getByRole("link", { name: /^enter data$/i }).click();

  // §13: a dead end gets a route out of it, not an explanation.
  await expect(page.getByText(/no stages yet/i)).toBeVisible();
  await page.getByRole("link", { name: /set its stages up/i }).click();
  await page.waitForURL(/\/edit/);
});

test("comparing two launches, side by side", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: /compare/i }).click();
  await page.waitForURL(/\/compare/);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toMatch(/Total revenue/);
  expect(text).toMatch(/Conversion rate/);
  expect(text).toMatch(/Cost per sale/);

  // The caption names the two launches in the order the columns run. It
  // used to read them right-to-left, so the heading said one thing and
  // the table said the other.
  const caption = await page.getByText(/→/).first().innerText();
  const [first, second] = caption.split("→").map((part) => part.trim());
  const headers = (await page.locator("th").allInnerTexts()).map((h) => h.toLowerCase());
  const firstAt = headers.findIndex((h) => h === first.toLowerCase());
  const secondAt = headers.findIndex((h) => h === second.toLowerCase());
  expect(firstAt).toBeGreaterThan(-1);
  expect(secondAt).toBeGreaterThan(firstAt);

  await shoot(page, TAB, "16-compare", w);

  // A plain GET form, so the pair is in the URL and the view is linkable.
  await page.getByRole("button", { name: /compare|show/i }).first().click();
  await page.waitForURL(/left=/);
});

test("compare is the team's screen, not the client's", async ({ page }) => {
  // Nina's decision 11. A client who reaches it by URL lands on their own
  // list rather than on a refusal.
  await signIn(page, "client");
  await page.goto("/reporting/launches/compare");
  await page.waitForURL(/\/reporting\/launches(\?|$)/);
});

test("the Launches tab separates this month's launches from the rest", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS, sql } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");
  await page.goto(`/reporting/launches?month=${MONTHS.sep}`);

  await expect(page.getByText(/live in september 2026/i)).toBeVisible();
  await expect(page.getByText(/every other launch/i)).toBeVisible();
  await shoot(page, TAB, "17-month-split", w);

  // A month no launch touched has no "live in" heading at all, rather
  // than an empty one.
  await page.goto(`/reporting/launches?month=${MONTHS.jul}`);
  await expect(page.getByText(/live in july 2026/i)).toHaveCount(0);

  // A launch spanning two months belongs to BOTH, which is the whole
  // reason this is an overlap rather than a match on the start date.
  // (Tested across August and September, not September and October: the
  // newest month anybody can report on is the last one that finished, so
  // an October URL falls back to September — by design, not a bug.)
  sql(`update public.report_launch_stages s set live_start = '2026-08-28', live_end = '2026-09-03'
        from public.report_launches l
       where l.id = s.launch_id and l.name = 'Autumn challenge';`);
  await page.goto(`/reporting/launches?month=${MONTHS.sep}`);
  await expect(page.getByText(/live in september 2026/i)).toBeVisible();
  await page.goto(`/reporting/launches?month=${MONTHS.aug}`);
  await expect(page.getByText(/live in august 2026/i)).toBeVisible();
});

test.describe("with JavaScript off, which is what the old confirmation could not survive", () => {
  test.use({ javaScriptEnabled: false });

  test("a save still says it saved", async ({ page }) => {
    await signIn(page, "nina");
    await page.goto("/reporting/launches");
    await page.getByRole("link", { name: "Autumn challenge" }).click();
    await page.getByRole("link", { name: /edit launch details/i }).click();
    await page.waitForURL(/\/edit/);

    const status = page.locator("select[name='status']");
    await status.selectOption("completed");
    await page.getByRole("button", { name: /save the status/i }).click();

    // The sentence is in the HTML the server sent, not in a client
    // component's state — so it is here with no React at all.
    await expect(page.locator("[data-saved]")).toHaveText("Status saved.");
    await expect(page).toHaveURL(/saved=status/);
    // And it really saved, rather than just saying so.
    await expect(status).toHaveValue("completed");
  });

  test("and an error still says what was wrong", async ({ page }) => {
    await signIn(page, "nina");
    await page.goto("/reporting/launches");
    await page.getByRole("link", { name: "Autumn challenge" }).click();
    await page.getByRole("link", { name: /edit launch details/i }).click();

    // Goals that do not ascend. The refusal is the action's return
    // value, not a redirect, because an error should leave what was
    // typed in the boxes.
    await page.locator("input[name='goal_good']").fill("60");
    await page.locator("input[name='goal_best']").fill("10");
    await page.getByRole("button", { name: /^Save$/ }).click();

    await expect(page.getByText(/go up in that order/i)).toBeVisible();
    await expect(page.locator("[data-saved]")).toHaveCount(0);
  });
});

test.describe("the cover image", () => {
  // A 1x1 PNG, which is a real PNG as far as the bucket's mime check is
  // concerned — the point is the plumbing, not the picture.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  test.use({ javaScriptEnabled: false });

  test("goes on, shows up on the report, and comes off again", async ({ page }, info) => {
    const w = width(info.project.name);
    await signIn(page, "nina");
    await page.goto("/reporting/launches");
    await page.getByRole("link", { name: "Autumn challenge" }).click();
    await page.getByRole("link", { name: /edit launch details/i }).click();

    await expect(page.getByText(/no cover yet/i)).toBeVisible();
    await page.setInputFiles("input[name='cover']", {
      name: "cover.png", mimeType: "image/png", buffer: PNG,
    });
    await page.getByRole("button", { name: /add a cover/i }).click();

    // A plain multipart post to a route handler — no JavaScript at all.
    await expect(page.locator("[data-saved]")).toHaveText("Cover image saved.");
    await expect(page.locator("img[alt='']").first()).toBeVisible();
    await shoot(page, TAB, "18-cover-admin", w);

    // And it reaches the report, signed rather than public.
    const back = page.getByRole("link", { name: /see the report|back to the launch/i }).first();
    if (await back.count()) await back.click();
    else await page.goBack();

    await page.getByRole("link", { name: /edit launch details/i }).click();
    await page.getByRole("button", { name: /remove it/i }).click();
    await expect(page.locator("[data-saved]")).toHaveText("Cover image removed.");
    await expect(page.getByText(/no cover yet/i)).toBeVisible();
  });

  test("a file that is not an image is refused, in words", async ({ page }) => {
    await signIn(page, "nina");
    await page.goto("/reporting/launches");
    await page.getByRole("link", { name: "Autumn challenge" }).click();
    await page.getByRole("link", { name: /edit launch details/i }).click();

    await page.setInputFiles("input[name='cover']", {
      name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture"),
    });
    await page.getByRole("button", { name: /add a cover/i }).click();

    await expect(page.getByRole("alert")).toContainText(/JPEG, PNG or WebP/i);
    await expect(page.getByText(/no cover yet/i)).toBeVisible();
  });
});
