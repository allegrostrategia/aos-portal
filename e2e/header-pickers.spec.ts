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
