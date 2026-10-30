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
/**
 * The twelve months the sparklines and trend charts draw, oldest first.
 *
 * The last of them is the month every one of these screens is shot on.
 *
 * Written out rather than computed from `monthsEndingAt`, so the fixture
 * and the code under test cannot be wrong together: if the axis helper
 * ever skipped a month, a fixture built from it would skip the same one
 * and every assertion would still pass.
 */
const HISTORY_MONTHS = [
  "2025-10-01", "2025-11-01", "2025-12-01",
  "2026-01-01", "2026-02-01", "2026-03-01",
  "2026-04-01", "2026-05-01", "2026-06-01",
  "2026-07-01", "2026-08-01", "2026-09-01",
];

/** Every month-level key the twelve-month fixture writes. */
const FIXTURE_KEYS = [
  "social_media_followers_at_month_end",
  "social_media_posts_published",
  "social_media_reach",
  "social_media_views",
  "social_media_likes_plus_comments",
  "social_media_saves",
  "social_media_shares",
  "email_list_size_at_month_end",
  "leads_conversions_new_leads_from_social",
  "leads_conversions_new_leads_from_email",
  "leads_conversions_new_clients",
  "financials_other_income",
  "financials_fixed_costs",
  "financials_variable_costs",
  "financials_team_costs",
];

/**
 * The ones the base seed never writes, so they are the fixture's on every
 * month including the three the seed fills in.
 */
const SEED_OWNED = new Set([
  "leads_conversions_new_leads_from_social",
  "leads_conversions_new_leads_from_email",
  "leads_conversions_new_clients",
  "financials_fixed_costs",
  "financials_variable_costs",
  "financials_team_costs",
]);
const FIXTURE_ONLY_KEYS = FIXTURE_KEYS.filter((k) => !SEED_OWNED.has(k));

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
      select (select id from w), m.month::date, v.key, inserted.id,
             -- A wobble on the climb. A perfectly straight ramp is the
             -- one shape real data never has, and two parallel straight
             -- lines are impossible to judge a chart by.
             case when v.key = 'offers_revenue_this_month'
                  then round(v.value * (0.55 + 0.45 * m.ordinality / 12.0)
                             * case m.ordinality % 4
                                 when 0 then 1.00 when 1 then 1.09
                                 when 2 then 0.93 else 1.05 end)
                  else v.value end,
             (select id from public.members where email = 'nina@aos.test')
      from inserted
      cross join unnest(array[${HISTORY_MONTHS.map((m) => `'${m}'`).join(",")}])
        with ordinality as m(month, ordinality)
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
      -- The fixture's own rows, and **only** those.
      --
      -- Two deletes rather than one, because the fixture and the base seed
      -- share some keys. The seed writes new clients, the two lead sources
      -- and the three cost lines for July, August and September, and the
      -- fixture's insert is ON CONFLICT DO NOTHING, so those rows are
      -- the seed's, not the fixture's, and taking them out here would
      -- leave the database quietly short for every spec that runs after
      -- this one. Months before July are the fixture's entirely; from July
      -- on, only the keys the seed never touches.
      delete from public.report_values
       where month in (${HISTORY_MONTHS.filter((m) => m < "2026-07-01")
         .map((m) => `'${m}'`)
         .join(",")})
         and entity_id is null
         and metric_key in (${FIXTURE_KEYS.map((k) => `'${k}'`).join(",")})
         and workspace_id = (select id from public.report_workspaces
                              where business_name = '${RETAINER}');
      delete from public.report_values
       where month in (${HISTORY_MONTHS.filter((m) => m < "2026-07-01")
         .map((m) => `'${m}'`)
         .join(",")})
         and metric_key in ('ads_leads', 'ads_spend')
         and entity_id in (
           select id from public.report_entities
            where entity_type = 'ad_campaign'
              and workspace_id = (select id from public.report_workspaces
                                   where business_name = '${RETAINER}')
         );
      delete from public.report_values
       where month in (${HISTORY_MONTHS.filter((m) => m >= "2026-07-01")
         .map((m) => `'${m}'`)
         .join(",")})
         and entity_id is null
         and metric_key in (${FIXTURE_ONLY_KEYS.map((k) => `'${k}'`).join(",")})
         and workspace_id = (select id from public.report_workspaces
                              where business_name = '${RETAINER}');
      update public.report_launches set cover_image_path = null
       where name = 'Autumn challenge';
    `);
  });

  /**
   * Twelve months of Social Media, Email and Leads figures.
   *
   * The seed has three months and the Social Media report had none at all,
   * so that screen was an empty state and — once Stage 3 landed — every
   * sparkline and trend chart on the review pack would have been the
   * "not enough months yet" sentence rather than a chart. A phase whose
   * deliverable is screenshots of charts has to have something to chart.
   *
   * September is the mockups' own numbers so the two can be held side by
   * side; the eleven months behind it climb towards them. Illustrative,
   * exactly as the brief now says mockup numbers are — nothing here is a
   * spec for anything.
   */
  test.beforeAll(async () => {
    /** Oldest first, ending at the month every screen is shot on. */
    const span = HISTORY_MONTHS;

    /**
     * September's figure and where the series starts twelve months back.
     *
     * A straight ramp between the two, with a small wobble so the lines
     * look like a business rather than a tutorial — a perfectly smooth
     * climb is the one shape real data never has, and it would make the
     * charts impossible to judge.
     */
    const SERIES: [string, number, number][] = [
      // key, twelve months ago, September
      ["social_media_followers_at_month_end", 18200, 26420],
      ["social_media_posts_published", 14, 22],
      ["social_media_reach", 88000, 184500],
      ["social_media_views", 196000, 412600],
      ["social_media_likes_plus_comments", 5400, 12640],
      ["social_media_saves", 1180, 3120],
      ["social_media_shares", 640, 1480],
      ["email_list_size_at_month_end", 2100, 3460],
      ["leads_conversions_new_leads_from_social", 7, 20],
      ["leads_conversions_new_leads_from_email", 3, 8],
      ["leads_conversions_new_clients", 2, 4],
      ["financials_other_income", 400, 900],
      ["financials_fixed_costs", 300, 300],
      ["financials_variable_costs", 180, 250],
      ["financials_team_costs", 380, 500],
    ];

    const wobble = [1, 1.04, 0.97, 1.06, 0.99, 1.03, 0.96, 1.05, 1.0, 1.02, 0.98, 1];

    const rows: string[] = [];
    span.forEach((month, i) => {
      const t = i / (span.length - 1);
      for (const [key, start, end] of SERIES) {
        // September lands exactly on the mockup's figure; the wobble only
        // touches the months behind it.
        const raw = start + (end - start) * t;
        const value = i === span.length - 1 ? end : Math.round(raw * wobble[i]);
        rows.push(
          `((select id from public.report_workspaces where business_name = '${RETAINER}'),
            '${month}', '${key}', ${value},
            (select id from public.members where email = 'nina@aos.test'))`,
        );
      }
    });

    await db(`
      insert into public.report_values
        (workspace_id, month, metric_key, value, entered_by)
      values ${rows.join(",")}
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

  /**
   * Ad campaign figures for the months before the seed's three.
   *
   * Without them, "new leads from ads" is 100 in September and nothing
   * before it — which is a real reading of the data and a rotten thing to
   * put in front of Nina: Total leads jumped 611% and its sparkline was a
   * flat line with a cliff on the end. Nobody looking at that is judging
   * the chart.
   *
   * Only the months before July, so the three the seed owns are left
   * exactly as they were.
   */
  test.beforeAll(async () => {
    const earlier = HISTORY_MONTHS.filter((m) => m < "2026-07-01");
    await db(`
      insert into public.report_values
        (workspace_id, month, metric_key, entity_id, value, entered_by)
      select e.workspace_id, m.month::date, v.key, e.id,
             round(v.value * (0.6 + 0.4 * m.ordinality / ${earlier.length}.0)),
             (select id from public.members where email = 'nina@aos.test')
      from public.report_entities e
      cross join unnest(array[${earlier.map((m) => `'${m}'`).join(",")}])
        with ordinality as m(month, ordinality)
      cross join (values ('ads_leads', 20), ('ads_spend', 400)) as v(key, value)
      where e.entity_type = 'ad_campaign'
        and e.workspace_id = (select id from public.report_workspaces
                               where business_name = '${RETAINER}')
      on conflict do nothing;
    `);
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
    // Stage 3's chart, which cannot read what it draws: Revenue and
    // Profit are calc metrics with no row in report_values, so an empty
    // panel here means the history is being read rather than worked out.
    await expect(page.getByText("Revenue vs profit")).toBeVisible();
    await expect(
      page.getByText(/Two months of figures are needed/),
    ).toHaveCount(0);
    // A sparkline on the cards, named rather than found by shape.
    await expect(
      page.getByRole("img", { name: /Revenue over the last 12 months/ }),
    ).toBeVisible();
    // The shortened label, on one line beside its disc.
    await expect(page.getByText("Email list", { exact: true })).toBeVisible();
    await shot(page, "1-overview", width(info.project.name));
  });

  test("2 — the Social Media report", async ({ page }, info) => {
    await page.goto("/reporting/social-media");
    await expect(page.getByRole("heading", { name: "Social Media" })).toBeVisible();
    // The three charts of the mockup, all three drawing something.
    for (const title of ["Followers over time", "Reach and views", "Save rate vs share rate"]) {
      await expect(page.getByText(title)).toBeVisible();
    }
    await expect(page.getByText(/are needed before there is a/)).toHaveCount(0);
    // **The six-month charts show six months, not twelve.** The axis and
    // the points are sliced together in one place; sliced apart, the
    // points would all have been right and every one of them in the
    // wrong position — which no screenshot would have shown.
    const sixMonth = page
      .getByRole("img", { name: /Reach and Views across 6 months/ })
      .first();
    await expect(sixMonth).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Followers across 12 months/ }),
    ).toBeVisible();
    // A sparkline on the cards, named rather than found by shape.
    await expect(
      page.getByRole("img", { name: /Followers at month end over the last 12 months/ }),
    ).toBeVisible();

    // **One icon per metric, not the category's on all six** (Dom, 30
    // Oct). Counted rather than named: the glyphs are decorative and
    // aria-hidden, so there is nothing to ask for by role — but the
    // thing that changed is that they stopped being identical, and the
    // number of distinct shapes says exactly that. Six headline cards,
    // and before this they shared one shape between them.
    // Scoped to `main`, not to a position in the tree: an ":first-of-type"
    // selector here depended on which wrapper the grid happened to be in
    // and passed on one project and not the other. The charts draw with
    // polyline, polygon and circle, so a <path> under main is an icon.
    await expect.poll(async () =>
      page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll("main svg path")].map((p) => p.getAttribute("d")),
          ).size,
      ),
    ).toBeGreaterThan(4);
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
