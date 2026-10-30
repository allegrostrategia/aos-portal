import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * The five screens the approved mockups cover, at both widths, for Nina.
 *
 * One spec rather than screenshots scattered through the feature specs,
 * because the thing being judged is whether these five look like the
 * pictures — which is a comparison across the set, not five separate
 * questions. Re-run at the end of each phase; the folder is the review pack.
 *
 *   npx playwright test mockup-screens.spec.ts
 */

requireLocalStack();

const OUT = "docs/nina-review/screens-mockup";
const RETAINER = "Northwind Studio";
/** The month every one of these screens is shot on. */
const MONTH = "2026-09-01";

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
}

const width = (name: string): "phone" | "desktop" => (name === "phone" ? "phone" : "desktop");

/**
 * Targets for the six Overview metrics, which the seed does not set.
 *
 * Without them the Overview shows "No targets set" and the coloured target
 * bars — one of the things being reviewed — are not on the page at all. The
 * values are chosen so the four tones each appear: met, close, halfway and
 * far, in that order down the panel.
 */
const TARGETS: [string, number][] = [
  ["leads_conversions_total_leads", 100], // 128 of 100 — met
  ["email_list_size_at_month_end", 4000], // 3,460 of 4,000 — close
  ["social_media_followers_at_month_end", 8000], // 4,680 of 8,000 — halfway
  ["leads_conversions_new_clients", 20], // 4 of 20 — far
  ["financials_total_revenue", 20000],
  ["financials_profit", 5000],
];

async function db(text: string) {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  return sql(text);
}

test.describe("the five mockup screens", () => {
  test.beforeAll(async () => {
    const values = TARGETS.map(
      ([key, value]) =>
        `((select id from public.report_workspaces where business_name = '${RETAINER}'),
          '${key}', ${value})`,
    ).join(",");
    await db(`
      insert into public.report_targets (workspace_id, metric_key, target_value)
      values ${values}
      on conflict do nothing;
    `);
  });

  /**
   * Two offers with a month's figures, which the seed also does not have.
   *
   * Without them the Offers screen is an empty state, and an empty state is
   * not something anybody can judge against a mockup. One one-off and one
   * recurring, because the pill has two readings and both should be on the
   * page Nina looks at.
   */
  test.beforeAll(async () => {
    await db(`
      with w as (
        select id from public.report_workspaces where business_name = '${RETAINER}'
      ), inserted as (
        insert into public.report_entities
          (workspace_id, entity_type, name, active, sort_order, price, pricing_model, hourly_cost)
        values
          ((select id from w), 'offer', 'Signature Programme', true, 1, 2500, 'one_off', 45),
          ((select id from w), 'offer', 'The Membership',      true, 2,  250, 'recurring', 45)
        on conflict do nothing
        returning id, name
      )
      insert into public.report_values
        (workspace_id, month, metric_key, entity_id, value, entered_by)
      select (select id from w), '${MONTH}', v.key, inserted.id, v.value,
             (select id from public.members where email = 'nina@aos.test')
      from inserted
      join (values
        ('Signature Programme', 'offers_units_sold', 4),
        ('Signature Programme', 'offers_revenue_this_month', 10000),
        ('Signature Programme', 'offers_hours_spent_delivering', 20),
        ('Signature Programme', 'offers_other_direct_costs', 400),
        ('The Membership', 'offers_units_sold', 22),
        ('The Membership', 'offers_revenue_this_month', 5500),
        ('The Membership', 'offers_hours_spent_delivering', 28),
        ('The Membership', 'offers_other_direct_costs', 300)
      ) as v(name, key, value) on v.name = inserted.name
      on conflict do nothing;
    `);
  });

  test.afterAll(async () => {
    await db(`
      delete from public.report_targets
       where workspace_id = (select id from public.report_workspaces
                              where business_name = '${RETAINER}');
      delete from public.report_values
       where entity_id in (
         select id from public.report_entities
          where entity_type = 'offer'
            and name in ('Signature Programme', 'The Membership')
       );
      delete from public.report_entities
       where entity_type = 'offer'
         and name in ('Signature Programme', 'The Membership');
      delete from public.report_values
       where metric_key like 'social_media_%'
         and month = '${MONTH}'
         and workspace_id = (select id from public.report_workspaces
                              where business_name = '${RETAINER}');
      update public.report_launches set cover_image_path = null
       where name = 'Autumn challenge';
    `);
  });

  /**
   * A month of Social Media figures, which the seed also lacks.
   *
   * The Social Media report is one of the five screens being compared and
   * it was drawing an empty state. These are the mockups' own numbers, so
   * the two can be held side by side — illustrative, exactly as the brief
   * now says mockup numbers are.
   */
  test.beforeAll(async () => {
    const FIGURES: [string, number][] = [
      ["social_media_followers_at_month_end", 26420],
      ["social_media_posts_published", 22],
      ["social_media_reach", 184500],
      ["social_media_views", 412600],
      ["social_media_likes_plus_comments", 12640],
      ["social_media_saves", 3120],
      ["social_media_shares", 1480],
    ];

    const rows = FIGURES.map(
      ([key, value]) =>
        `((select id from public.report_workspaces where business_name = '${RETAINER}'),
          '${MONTH}', '${key}', ${value},
          (select id from public.members where email = 'nina@aos.test'))`,
    ).join(",");

    await db(`
      insert into public.report_values
        (workspace_id, month, metric_key, value, entered_by)
      values ${rows}
      on conflict do nothing;
    `);
  });

  /**
   * A cover on the launch, because the mockups put a photograph on every
   * launch card and an empty frame is not a thing to judge.
   *
   * A real object in the bucket rather than a path pointing at nothing:
   * the page signs the path through the reader's own session, and a signed
   * URL for a file that is not there is a broken image, which would look
   * like a bug in the screenshot rather than a fixture.
   */
  test.beforeAll(async () => {
    const stack = requireLocalStack();
    const { readFileSync } = await import("node:fs");

    const launchId = (
      await db(
        `select id::text from public.report_launches where name = 'Autumn challenge' limit 1;`,
      )
    ).trim();
    if (!launchId) return;

    const workspaceId = (
      await db(
        `select id::text from public.report_workspaces where business_name = '${RETAINER}' limit 1;`,
      )
    ).trim();

    // The path shape the policies read: workspace/launch.ext.
    const path = `${workspaceId}/${launchId}.jpg`;
    const body = readFileSync("public/stations/terrazza.jpg");

    await fetch(`${stack.url}/storage/v1/object/launch-covers/${path}`, {
      method: "POST",
      headers: {
        apikey: stack.serviceKey,
        Authorization: `Bearer ${stack.serviceKey}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body,
    });

    await db(
      `update public.report_launches set cover_image_path = '${path}' where id = '${launchId}';`,
    );
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, "nina");
  });

  test("1 — the Overview", async ({ page }, info) => {
    await page.goto("/reporting");
    await expect(page.getByRole("heading", { name: "Monthly Report" })).toBeVisible();
    // The coloured target bars, which only exist once targets do.
    await expect(page.getByText("How this month is going")).toBeVisible();
    // The tab row is the one piece every screen shares, so assert it once
    // here rather than five times: the active tab is the lemon pill rather
    // than an underline, and it says so to a screen reader too.
    //
    // Desktop only, and not a shortcut: below `sm` there is no tab row at
    // all. Eleven tabs would not fit, so a phone gets the `<details>`
    // picker instead — measured at 390px on 8 October.
    if (info.project.name !== "phone") {
      const overview = page.getByRole("link", { name: /Overview/ }).first();
      await expect(overview).toHaveAttribute("aria-current", "page");
    }
    await shot(page, "1-overview", width(info.project.name));
  });

  test("2 — the Social Media report", async ({ page }, info) => {
    await page.goto("/reporting/social-media");
    await expect(page.getByRole("heading", { name: "Social Media" })).toBeVisible();
    await shot(page, "2-social-media-report", width(info.project.name));
  });

  test("3 — the Social Media entry screen", async ({ page }, info) => {
    await page.goto("/reporting/enter/social-media");
    await expect(page.getByRole("heading", { name: "Enter your data" })).toBeVisible();
    // The mockups' progress bar, which is the entry screen's own furniture.
    await expect(page.getByText(/sections complete/)).toBeVisible();
    await shot(page, "3-social-media-entry", width(info.project.name));
  });

  test("4 — Offers", async ({ page }, info) => {
    await page.goto("/reporting/offers");
    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
    // The mockups' pill, on both kinds.
    await expect(page.getByText("One-off").first()).toBeVisible();
    await expect(page.getByText("Recurring").first()).toBeVisible();
    await shot(page, "4-offers", width(info.project.name));
  });

  test("5 — Launches", async ({ page }, info) => {
    await page.goto("/reporting/launches");
    await expect(page.getByText(RETAINER).first()).toBeVisible();
    // The cover the fixture put on Autumn challenge. Decorative, so it has
    // an empty alt and is found by its source rather than by a name.
    await expect(page.locator('img[src*="launch-covers"]').first()).toBeVisible();
    await shot(page, "5-launches", width(info.project.name));
  });
});
