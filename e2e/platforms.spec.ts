import { expect, test } from "./quiet.ts";

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

const platform = (name: string, order: number, kind: string | null = null) =>
  `insert into public.report_entities (workspace_id, entity_type, name, sort_order, platform_kind)
   select id, 'social_platform', '${name}', ${order}, ${kind ? `'${kind}'` : "null"}
     from public.report_workspaces
    where business_name = 'Northwind Studio';`;

const figure = (platformName: string, month: string, key: string, value: number) =>
  `insert into public.report_values (workspace_id, month, metric_key, entity_id, value)
   select e.workspace_id, '${month}-01', '${key}', e.id, ${value}
     from public.report_entities e
     join public.report_workspaces w on w.id = e.workspace_id
    where w.business_name = 'Northwind Studio'
      and e.entity_type = 'social_platform' and e.name = '${platformName}';`;

/** LinkedIn's id, for a URL that names the platform rather than clicking to it. */
async function linkedInId(): Promise<string> {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  return sql(
    `select e.id::text from public.report_entities e
       join public.report_workspaces w on w.id = e.workspace_id
      where w.business_name = 'Northwind Studio'
        and e.entity_type = 'social_platform' and e.name = 'LinkedIn';`,
  ).trim();
}

test.beforeEach(async () => {
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  // The seed enters no Social Media figures, so this makes the state
  // Nina described: two platforms, each with its own month.
  sql(`
    ${platform("Instagram", 1, "instagram")}
    ${platform("LinkedIn", 2, "linkedin")}
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
    -- LinkedIn's own figures, not Instagram's under a LinkedIn pill
    -- (§5.2's per-platform sets, 17 November). It reports impressions
    -- and members reached rather than reach, and counts a reaction and
    -- a comment separately. These are inside the SQL string, so they are
    -- SQL comments: a // here would be sent to Postgres.
    ${figure("LinkedIn", MONTHS.sep, "social_media_impressions", 28400)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_members_reached", 14200)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_reactions", 640)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_comments", 95)}
    -- Reposts is deliberately left out: it is one of LinkedIn's core
    -- figures, and the test below is that a section is unfinished while
    -- any platform still owes one of ITS OWN.
    ${figure("LinkedIn", MONTHS.sep, "social_media_link_clicks", 310)}
    ${figure("LinkedIn", MONTHS.sep, "social_media_profile_visits", 870)}
  `);
});

test("the pill switches platform, and each one's figures are its own", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);
  // The main platform by default: the first by sort order, which is the
  // one the Overview reads too.
  // The card, not the year grid, which legitimately carries the same
  // figure in its December column since 15 November.
  await expect(page.getByRole("paragraph").filter({ hasText: "26,420" }).first()).toBeVisible();
  await shoot(page, TAB, "01-report-instagram", w);

  await page.getByText("Instagram", { exact: true }).first().click();
  await page.getByRole("link", { name: "LinkedIn" }).click();
  await page.waitForURL(/platform=/);

  const linkedIn = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(linkedIn, "LinkedIn's own followers").toContain("3,120");
  expect(linkedIn, "and not Instagram's").not.toContain("26,420");
  expect(linkedIn, "nor Instagram's reach").not.toContain("184,500");
  expect(linkedIn, "LinkedIn's members reached").toContain("14,200");
  // And in LinkedIn's words, which is §5.2's whole point: it reports
  // impressions and reach is not one of its figures.
  expect(linkedIn, "LinkedIn's impressions").toContain("28,400");
  expect(linkedIn).toContain("Impressions");
  expect(linkedIn, "a page does not have saves").not.toContain("Save rate");

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

  // Instagram has all seven of ITS core figures; LinkedIn is still
  // owed reposts, which is one of its own and not one of Instagram's
  // (§5.2's per-platform sets). Before 11 November this read as
  // finished the moment Instagram was done; before 17 November it would
  // have been unfinishable, because Instagram is never asked for
  // impressions and LinkedIn is never asked for saves.
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
    .getByRole("button", { name: "Save" })
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

/**
 * §5.2's kind (Nina, 16 November): which platform a row actually is.
 *
 * **The point is that it is not the name.** A client who calls theirs
 * "IG — main" still gets Instagram's figures, and a campaign account
 * called "Instagram Ads" is not handed them by accident — which is why
 * this walks a name and a kind that deliberately disagree.
 */
test("a platform is told what kind it is, and the name does not decide", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  const card = page.locator("section").filter({ hasText: "The platforms you post on" });
  await expect(card).toBeVisible();

  // Instagram was made by the first save, so it knows what it is.
  await expect(
    card.getByLabel("What kind of platform Instagram is"),
    "created as Instagram, so its kind is not a guess",
  ).toHaveValue("instagram");

  // A new one, named one thing and declared another.
  await card.getByRole("button", { name: /add a platform/i }).click();
  await card.getByLabel("Add a platform").fill("Instagram Ads");
  await card.getByLabel("What kind of platform this is").selectOption("facebook");
  await card.getByRole("button", { name: /^Add$/ }).click();
  await expect(page.getByText(/Instagram Ads added/i)).toBeVisible();

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await expect(
    page.getByLabel("What kind of platform Instagram Ads is"),
    "the kind chosen, not the one its name reads like",
  ).toHaveValue("facebook");

  await shoot(page, TAB, "08-platform-kinds", w);
});

/**
 * A platform from before the kind existed, which nobody has answered for.
 *
 * It is allowed — the database does not refuse one — and the card has to
 * say so rather than quietly handing out the general figure set.
 */
test("a platform with no kind yet is asked for one", async ({ page }, info) => {
  const w = width(info.project.name);
  const { sql } = await import("../scripts/seed-test-db.mjs");
  // A platform from before the kind existed: the same shape the backfill
  // leaves behind for a name it could not place, like Threads or
  // Pinterest.
  sql(platform("Threads", 9));
  // Proved rather than assumed: if the insert goes astray, this says so
  // instead of the badge assertion twenty lines down blaming the card.
  expect(
    sql(`select count(*)::text from public.report_entities e
           join public.report_workspaces w on w.id = e.workspace_id
          where w.business_name = 'Northwind Studio' and e.name = 'Threads'`),
    "the kindless platform was seeded",
  ).toBe("1");

  await signIn(page, "nina");
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);

  // The badge on the card, and the empty picker on the row. Asserted on
  // the card's text rather than on a row element: the shell draws a pill
  // per platform in an `li` too, so "the li that says Threads" is
  // ambiguous on this page and was silently reading the header.
  const card = page.locator("section").filter({ hasText: "The platforms you post on" }).last();
  await expect(card, "the card asks for a kind it has not been given").toContainText(
    /needs a kind/i,
  );
  const picker = page.getByLabel("What kind of platform Threads is");
  await expect(picker).toHaveValue("");

  await picker.selectOption("other");
  await page
    .locator("form")
    .filter({ has: page.getByLabel("What kind of platform Threads is") })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText(/Renamed to Threads/i)).toBeVisible();

  // What matters is that the kind stuck, which is a stronger claim than
  // the badge going away.
  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await expect(page.getByLabel("What kind of platform Threads is")).toHaveValue("other");
  await expect(
    page.locator("section").filter({ hasText: "The platforms you post on" }).last(),
    "and the card stops asking",
  ).not.toContainText(/needs a kind/i);

  await shoot(page, TAB, "09-kind-needed", w);
});

/**
 * §5.2's per-platform figure sets (Nina, 16 November; built 17
 * November). The entry screen is the one place the kind decides what is
 * ON the screen rather than only what it is called.
 */
test("the boxes follow the platform, not just their values", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  /**
   * By the id the entry form gives each box, `v-<metric key>`, not by
   * its label: "Saves" is also the name of a column on every row of
   * "Top posts this month", three rows down the same page, so a label
   * match finds four boxes and a strict-mode violation.
   */
  await expect(page.locator("#v-social_media_saves"), "Instagram is asked for saves").toBeVisible();
  await expect(page.locator("#v-social_media_impressions")).toHaveCount(0);
  await shoot(page, TAB, "10-entry-instagram", w);

  await page.goto(
    `/reporting/enter/social-media?month=${MONTHS.sep}&platform=${await linkedInId()}`,
  );
  await expect(
    page.locator("#v-social_media_impressions"),
    "LinkedIn is asked for impressions",
  ).toBeVisible();
  await expect(page.locator("#v-social_media_members_reached")).toBeVisible();
  await expect(page.locator("#v-social_media_reposts")).toBeVisible();
  await expect(
    page.locator("#v-social_media_saves"),
    "and never for saves, which LinkedIn does not have",
  ).toHaveCount(0);

  // The worked-out panel says what IT is measured against, too: the
  // same words, against impressions rather than reach.
  const worked = (
    await page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Worked out for you" }) })
      .innerText()
  ).replace(/\s+/g, " ");
  expect(worked).toContain("(Reactions + comments + reposts) ÷ impressions");
  expect(worked, "no save rate on a platform with no saves").not.toContain("Save rate");

  /**
   * **And it works them OUT, not just labels them.** The panel is
   * computed in the browser as you type, so it takes the kind as a prop
   * — and without that prop it printed three dashes here beside the
   * boxes the figures are in, while the report had them right. The
   * formula line above is server-rendered and said the right words
   * throughout, which is why only the numbers catch it.
   *
   *   (640 reactions + 95 comments) ÷ 28,400 impressions = 2.6%
   *   310 link clicks ÷ 28,400 = 1.1%
   *   870 profile views ÷ 28,400 = 3.1%
   */
  expect(worked, "engagement rate, LinkedIn's way").toContain("2.6%");
  expect(worked, "click-through rate against impressions").toContain("1.1%");
  expect(worked, "profile view rate, the same").toContain("3.1%");
  await shoot(page, TAB, "11-entry-linkedin", w);
});

test("a figure the month already holds is never hidden by a kind", async ({ page }) => {
  // The rule that makes a kind safe to correct: a client whose platform
  // was "Other" and is put right as LinkedIn keeps every figure anybody
  // entered, visible and editable. Rule 7, applied to a figure.
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(figure("LinkedIn", MONTHS.sep, "social_media_saves", 77));

  await signIn(page, "nina");
  await page.goto(
    `/reporting/enter/social-media?month=${MONTHS.sep}&platform=${await linkedInId()}`,
  );
  const saves = page.locator("#v-social_media_saves");
  await expect(saves, "the box is there because the figure is").toBeVisible();
  await expect(saves).toHaveValue("77");
});

/**
 * **A Meta export is only offered where it can fill something** (Dom,
 * 18 November). The file is a Meta Business Suite content export and
 * LinkedIn's boxes are impressions, members reached, reactions and
 * reposts — not one of which is in it. The card used to be drawn on
 * every platform with a sentence underneath guessing from the NAME that
 * a Meta export was probably not what you meant, which is the kind of
 * advice a person reads once and a wrong figure survives.
 */
test("the file card follows the platform too", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/social-media?month=${MONTHS.sep}`);
  await expect(
    page.getByText("Fill from a file"),
    "Instagram, which a Meta export is for",
  ).toBeVisible();
  // And it says which platform it will fill, since there is more than one.
  await expect(page.getByText(/These figures will fill/)).toContainText("Instagram");

  await page.goto(
    `/reporting/enter/social-media?month=${MONTHS.sep}&platform=${await linkedInId()}`,
  );
  // The boxes are still there — it is only the shortcut that is gone.
  await expect(page.locator("#v-social_media_impressions")).toBeVisible();
  await expect(
    page.getByText("Fill from a file"),
    "LinkedIn, which it cannot fill one box of",
  ).toHaveCount(0);

  await shoot(page, TAB, "12-entry-linkedin-no-file-card", w);
});

/**
 * **The note belongs to the section, not to the platform** (Dom, 18
 * November). It is written once for Social Media in a month, and
 * sitting at the bottom of a page with a platform switcher it read as a
 * note about whichever platform was on screen — the YouTube page ended
 * a screen of watch time with a paragraph about Instagram reels.
 */
test("the strategist's note is above the figures, and there is one of it", async ({ page }) => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`insert into public.report_notes (workspace_id, month, category, note_type, body, author_id)
       select w.id, '${MONTHS.sep}-01', 'social_media', 'strategist',
              'Reels are carrying the account this month.', a.user_id
         from public.report_workspaces w
         join public.report_access a
           on a.workspace_id = w.id and a.role <> 'client'
        where w.business_name = 'Northwind Studio' limit 1;`);

  await signIn(page, "nina");
  for (const platform of [null, await linkedInId()]) {
    await page.goto(
      `/reporting/social-media?month=${MONTHS.sep}${platform ? `&platform=${platform}` : ""}`,
    );
    const heading = page.getByText("Notes from your strategist");
    await expect(heading, "once, whichever platform").toHaveCount(1);

    // Above everything the switcher changes. The headline figures are
    // the first thing that is a platform's, so the note is before them.
    const order = await page.evaluate(() => {
      const all = [...document.querySelectorAll("main *")];
      const note = all.findIndex((el) => el.textContent?.trim() === "Notes from your strategist");
      const kpi = all.findIndex((el) => el.matches("[data-kpi]"));
      return { note, kpi };
    });
    expect(order.note, "the note is on the page").toBeGreaterThan(-1);
    expect(order.kpi, "and so are the figures").toBeGreaterThan(-1);
    expect(order.note, "the note comes first").toBeLessThan(order.kpi);
  }

  // And it has NOT moved on the other ten, which have nothing to be
  // mistaken for — only Social Media has a switcher.
  await page.goto(`/reporting/email?month=${MONTHS.sep}`);
  const elsewhere = await page.evaluate(() => {
    const all = [...document.querySelectorAll("main *")];
    const note = all.findIndex((el) => el.textContent?.trim() === "Notes from your strategist");
    const kpi = all.findIndex((el) => el.matches("[data-kpi]"));
    return { note, kpi };
  });
  expect(elsewhere.note, "still under the figures on Email").toBeGreaterThan(elsewhere.kpi);
});
