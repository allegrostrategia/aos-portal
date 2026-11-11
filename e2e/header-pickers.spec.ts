import { expect, test, type Locator } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * The month and business dropdowns in the reporting header.
 *
 * **Nina, 3 November, on the live site: you cannot switch month or
 * client.** Phase 5 put `overflow-hidden` on the header to keep the corner
 * photograph inside it, and both pickers are absolutely positioned *in*
 * that header — so an open list was cut off at the header's bottom edge.
 * Two days live, and nothing failed: every existing test navigates by URL,
 * and `toBeVisible()` is true of an element clipped by an ancestor.
 *
 * So this spec does the one thing none of them did — opens each list and
 * looks at what is actually painted. `document.elementFromPoint` at the
 * list's own corners answers the question a person is really asking:
 * **is the thing I am trying to click the thing under my finger.** Then it
 * clicks an option and checks the page moved, which is the half that
 * proves the first half was worth asserting.
 *
 * At both widths, because the header is a different shape on a phone: the
 * paging arrows are gone and the controls wrap, so the list opens from a
 * different place and has a different amount of header below it.
 */

requireLocalStack();

const TAB = "header-pickers";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

/**
 * What is painted where the list is, rather than what the DOM believes.
 *
 * An element inside `overflow: hidden` keeps its box and its computed
 * styles — it is "visible" to every check Playwright makes on its own —
 * and simply is not drawn. The only way to tell from the outside is to
 * ask the document what is at those coordinates.
 */
async function painted(list: Locator) {
  return list.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const mine = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === el || el.contains(hit));
    };
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      top: mine(rect.x + rect.width / 2, rect.y + 4),
      bottom: mine(rect.x + rect.width / 2, rect.bottom - 4),
      // Off the bottom of the window is a different bug with the same
      // symptom, and it would make the two probes above meaningless.
      inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
    };
  });
}

async function expectWholeListPainted(list: Locator, what: string) {
  const seen = await painted(list);
  expect(seen.inViewport, `${what}: the open list is off the window ${JSON.stringify(seen.rect)}`)
    .toBe(true);
  expect(seen.top, `${what}: the top of the open list is not drawn`).toBe(true);
  expect(
    seen.bottom,
    `${what}: the bottom of the open list is not drawn — something is clipping it`,
  ).toBe(true);
}

test("the month dropdown opens whole, and picking a month moves the page", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const picker = page.locator("header details").filter({ hasText: "September 2026" });
  await picker.locator("summary").click();

  const list = picker.locator("ul");
  await expect(list).toBeVisible();
  await expectWholeListPainted(list, "the month list");

  // More than the one month already on screen, or the list proves nothing.
  expect(await list.locator("li").count()).toBeGreaterThan(1);

  await shoot(page, TAB, "01-month-open", w);

  await list.getByRole("link", { name: "August 2026" }).click();
  await page.waitForURL(/month=2026-08/);
  await expect(page.locator("header").getByText("August 2026").first()).toBeVisible();
});

test("the business dropdown opens whole, and picking a client moves the page", async ({
  page,
}, info) => {
  const w = width(info.project.name);

  // **Nina has a page of clients; the fixture has two.** Two fit inside
  // even the clipped header, so a list of two would have passed on the
  // broken build and guarded nothing. Eight more, which is nearer what
  // she is actually looking at — removed by the next `seed()`, which
  // empties the table.
  const { RETAINER, sql } = await import("../scripts/seed-test-db.mjs");
  const owner = sql(
    `select owner_user_id from public.report_workspaces where business_name = '${RETAINER}';`,
  );
  sql(`insert into public.report_workspaces (kind, owner_user_id, business_name, first_month)
       select 'retainer', '${owner}', 'Test Client ' || g, '${MONTHS.jul}-01'
       from generate_series(1, 8) g;`);

  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const picker = page.locator("header details").filter({ hasText: "Northwind Studio" });
  await picker.locator("summary").click();

  const list = picker.locator("ul");
  await expect(list).toBeVisible();
  await expectWholeListPainted(list, "the business list");
  expect(await list.locator("li").count(), "the long list is what makes this a test").toBeGreaterThan(5);

  await shoot(page, TAB, "02-business-open", w);

  await list.getByRole("link", { name: "Ruth Test Coaching" }).click();
  await page.waitForURL(/workspace=/);
  await expect(page.locator("header").getByText("Ruth Test Coaching").first()).toBeVisible();
});

/**
 * What the clipping was for, kept honest.
 *
 * The picture is full-bleed — its right edge is meant to *be* the window's
 * right edge, which is what lets it carry full opacity on that side with
 * no visible cut. That is the whole reason a clipping box exists, and it
 * is why the fix moved the clip onto the picture rather than deleting it.
 *
 * Asserted as the edge rather than as the absence of a scrollbar: a
 * headless window has no scrollbar to overflow into, so "the page does not
 * scroll sideways" is a sentence that cannot fail here. The edge can.
 */
test("the picture is flush with the window's edge", async ({ page }, info) => {
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const art = page.locator("header [data-header-art]");

  if (info.project.name === "phone") {
    // Not drawn below `sm`, and not fetched there either.
    await expect(art).toBeHidden();
    return;
  }

  const edge = await art.evaluate((el) => ({
    right: el.getBoundingClientRect().right,
    window: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(Math.abs(edge.right - edge.window), `${JSON.stringify(edge)}`).toBeLessThanOrEqual(1);
  expect(edge.overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
});

/**
 * Each pill closes when you choose from it (Dom, 11 November).
 *
 * Every option is a `<Link>` inside a `<details>`, so choosing one is a
 * soft navigation: React keeps the same DOM node, the node keeps its
 * `open` attribute, and the open menu sits over the tab row until you
 * click somewhere else. Seen in a screenshot of the platform pill, and
 * true of all three — the month and business pickers had done it since
 * they were built.
 *
 * Asserted on the attribute rather than on what is visible, because an
 * open `<details>` whose list happens to be scrolled out of view is
 * still the bug.
 */
test("choosing from a pill closes it, on all three", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS, sql } = await import("../scripts/seed-test-db.mjs");

  // A second platform, so the platform pill is drawn at all — it hides
  // itself for a client with one.
  sql(`insert into public.report_entities (workspace_id, entity_type, name, sort_order)
       select id, 'social_platform', 'Instagram', 1 from public.report_workspaces
        where business_name = 'Northwind Studio';
       insert into public.report_entities (workspace_id, entity_type, name, sort_order)
       select id, 'social_platform', 'LinkedIn', 2 from public.report_workspaces
        where business_name = 'Northwind Studio';`);

  await signIn(page, "nina");
  await page.goto(`/reporting/social-media?month=${MONTHS.sep}`);

  const open = page.locator("details[open]");

  // The month.
  const months = page.locator("header details").filter({ hasText: "September 2026" });
  await months.locator("summary").click();
  await expect(open).toHaveCount(1);
  await months.getByRole("link", { name: "August 2026" }).click();
  await page.waitForURL(/month=2026-08/);
  await expect(open, "the month pill closed itself").toHaveCount(0);

  // The platform.
  const platforms = page.locator("header details").filter({ hasText: "Instagram" });
  await platforms.locator("summary").click();
  await expect(open).toHaveCount(1);
  await platforms.getByRole("link", { name: "LinkedIn" }).click();
  await page.waitForURL(/platform=/);
  await expect(open, "and so did the platform pill").toHaveCount(0);

  // The business. Nina has more than one, so hers is drawn.
  const businesses = page.locator("header details").filter({ hasText: "Northwind Studio" });
  await businesses.locator("summary").click();
  await expect(open).toHaveCount(1);
  await businesses.locator("ul a").filter({ hasNotText: "Northwind Studio" }).first().click();
  await page.waitForURL(/workspace=/);
  await expect(open, "and the business pill").toHaveCount(0);

  await shoot(page, TAB, "05-pills-closed", w);
});
