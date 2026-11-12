import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

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
 * The month every one of these screens is shot on, named in the URL rather
 * than left to whichever month the app opens on.
 *
 * It has to be named. The fixture below writes twelve months ending in
 * September 2026, and the app opens on the most recent month there is to
 * report — so for as long as these were run during October the default
 * happened to be the fixture's last month and nobody had to say so. On
 * 1 November it became the month after, every screen came up empty, and
 * six tests failed at once for a reason that had nothing to do with the
 * code they were testing.
 */
const SHOT_MONTH = "2026-09-01";
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
];

/**
 * The ones the base seed never writes, so they are the fixture's on every
 * month including the three the seed fills in.
 */
const SEED_OWNED = new Set([
  "leads_conversions_new_leads_from_social",
  "leads_conversions_new_leads_from_email",
  "leads_conversions_new_clients",
]);
const FIXTURE_ONLY_KEYS = FIXTURE_KEYS.filter((k) => !SEED_OWNED.has(k));

/** `--aos-ink`, which every piece of text on these screens is some share of. */
const INK: [number, number, number] = [10, 30, 74];

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The contrast of text drawn at `alpha` of ink against one backdrop pixel.
 *
 * The alpha is on the *text*, so the glyph's own colour depends on what is
 * behind it — `text-ink/80` over a photograph is not the same colour it is
 * over the ground. Compositing the glyph before measuring is the difference
 * between a number and a guess.
 */
function inkContrast(bg: [number, number, number], alpha: number): number {
  const fg = bg.map((c, i) => alpha * INK[i] + (1 - alpha) * c) as [number, number, number];
  const [light, dark] = [luminance(bg), luminance(fg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The worst contrast any pixel behind `locator` gives the text drawn on it.
 *
 * **Measured, not reasoned about.** The brand line in the header sits in the
 * fade of a photograph, and how legible that leaves it is a question about
 * the pixels that end up on the screen — the mask, the image's own opacity,
 * and which part of the photograph happens to be under those words. None of
 * that is visible in a class name, and a mask that silently stopped applying
 * would leave every assertion about the markup passing.
 *
 * So: hide the text, photograph the rectangle it was in, and composite the
 * text colour onto every pixel of it.
 */
async function worstContrastBehind(page: Page, locator: ReturnType<Page["getByText"]>, alpha: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("nothing to measure: the element has no box");

  await locator.evaluate((el) => {
    (el as HTMLElement).style.visibility = "hidden";
  });
  const behind = await page.screenshot({ clip: box });
  await locator.evaluate((el) => {
    (el as HTMLElement).style.visibility = "";
  });

  const { data } = await sharp(behind).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let worst = Infinity;
  for (let i = 0; i < data.length; i += 3) {
    worst = Math.min(worst, inkContrast([data[i], data[i + 1], data[i + 2]], alpha));
  }
  return worst;
}

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
   * Two more launches, so the row is a row.
   *
   * The base seed has two, and the page splits them: one is live in
   * September and goes under its own heading, the other does not. Three
   * cards across is the layout being judged and two launches in two
   * sections cannot show it — the screenshot said "stacked" when the
   * grid was three-across all along.
   *
   * Empty on purpose, both of them. The mockup's own third card is a
   * planning launch with £0, 0/15 and an empty ring, and a card with
   * nothing in it is the one most likely to lay out wrong.
   */
  test.beforeAll(async () => {
    await db(`
      insert into public.report_launches
        (workspace_id, name, description, status, goal_good, goal_better, goal_best,
         planner_show_up_rate, planner_conversion_rate)
      values
        ((select id from public.report_workspaces where business_name = '${RETAINER}'),
         'Evergreen mastermind', null, 'planning', 15, 25, 40, 47, 5),
        ((select id from public.report_workspaces where business_name = '${RETAINER}'),
         'Winter workshop', 'One afternoon, one offer', 'planning', 25, 40, 55, 47, 5)
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
          ((select id from w), 'offer', 'The Membership',      true, 2,  250, 'recurring', 45),
          ((select id from w), 'offer', 'VIP Day',             true, 3, 1500, 'one_off', 45),
          ((select id from w), 'offer', 'Done-with-you Launch',true, 4, 4850, 'one_off', 45)
        on conflict do nothing
        returning id, name
      )
      insert into public.report_values
        (workspace_id, month, metric_key, entity_id, value, entered_by)
      select (select id from w), m.month::date, v.key, inserted.id,
             -- The climb and its wobble live on the money now, which is
             -- the Actual grid below: an offer's revenue is not a typed
             -- figure since 13 November.
             v.value,
             (select id from public.members where email = 'nina@aos.test')
      from inserted
      cross join unnest(array[${HISTORY_MONTHS.map((m) => `'${m}'`).join(",")}])
        with ordinality as m(month, ordinality)
      join (values
        ('Signature Programme', 'offers_units_sold', 4),
        ('Signature Programme', 'offers_hours_spent_delivering', 20),
        ('Signature Programme', 'offers_other_direct_costs', 400),
        ('The Membership', 'offers_units_sold', 22),
        ('The Membership', 'offers_hours_spent_delivering', 28),
        ('The Membership', 'offers_other_direct_costs', 300),
        ('VIP Day', 'offers_units_sold', 3),
        ('VIP Day', 'offers_hours_spent_delivering', 18),
        ('VIP Day', 'offers_other_direct_costs', 250),
        -- Deliberately the thin one: 30 hours against £4,850 is £162 an
        -- hour, under the £200 target below, so the card's warning and
        -- the bar chart's target line both have something to say. The
        -- mockup's own fourth offer is the same shape.
        ('Done-with-you Launch', 'offers_units_sold', 1),
        ('Done-with-you Launch', 'offers_hours_spent_delivering', 30),
        ('Done-with-you Launch', 'offers_other_direct_costs', 0)
      ) as v(name, key, value) on v.name = inserted.name
      on conflict do nothing;
    `);

    /**
     * **And the money, which is the Actual grid** (13 November): an
     * offer's revenue is what came in on the Financials rows linked to
     * it, so the four offers get a row each and twelve months of cells.
     *
     * The climb and its wobble are here, where the figures are. A
     * perfectly straight ramp is the one shape real data never has, and
     * two parallel straight lines are impossible to judge a chart by.
     */
    await db(`
      with w as (
        select id from public.report_workspaces where business_name = '${RETAINER}'
      ), rows_in as (
        insert into public.report_sales_rows
          (workspace_id, name, row_type, offer_entity_id, sort_order)
        select (select id from w), e.name, 'offer', e.id, e.sort_order
          from public.report_entities e
         where e.workspace_id = (select id from w) and e.entity_type = 'offer'
        on conflict do nothing
        returning id, name
      )
      insert into public.report_actuals (workspace_id, sales_row_id, month, amount)
      select (select id from w), rows_in.id, m.month::date,
             round(v.amount * (0.55 + 0.45 * m.ordinality / 12.0)
                   * case m.ordinality % 4
                       when 0 then 1.00 when 1 then 1.09
                       when 2 then 0.93 else 1.05 end)
        from rows_in
        cross join unnest(array[${HISTORY_MONTHS.map((m) => `'${m}'`).join(",")}])
          with ordinality as m(month, ordinality)
        join (values
          ('Signature Programme', 10000),
          ('The Membership', 5500),
          ('VIP Day', 4500),
          ('Done-with-you Launch', 4850)
        ) as v(name, amount) on v.name = rows_in.name
      on conflict do nothing;
    `);

    // The target the hourly-rate bars are measured against, and what the
    // offer cards warn below. Without it the chart draws bars and no
    // line, which is half the panel.
    await db(`
      update public.report_workspaces set target_hourly_rate = 200
       where business_name = '${RETAINER}';
    `);
  });

  /**
   * Two more stages on Autumn challenge, so the timeline has a shape.
   *
   * The seed gives it two — a challenge and a masterclass — which is a
   * real launch and a thin picture: a horizontal timeline of two discs
   * says very little about whether a horizontal timeline works. The
   * mockup draws five. These two take it to four, which is enough to see
   * the rail, the spacing and what happens to it at 390px.
   *
   * Neither carries a figure, so nothing downstream changes: the
   * attendance panels filter on having one, the conversion rate hangs off
   * the main selling stage, and that is still the masterclass.
   *
   * Removed in `afterAll`, like the two extra launches — `launches.spec`
   * edits this launch's stages through its own screen and must find them
   * as the seed left them.
   */
  test.beforeAll(async () => {
    await db(`
      insert into public.report_launch_stages
        (launch_id, position, stage_type, name, live_days,
         promo_start, promo_end, live_start, live_end)
      select l.id, v.position, v.stage_type::public.report_launch_stage_type,
             v.name, null, v.promo_start::date, v.promo_end::date,
             v.live_start::date, v.live_end::date
      from public.report_launches l
      cross join (values
        (3, 'open_cart', 'Sales week', '2026-09-19', '2026-09-20',
         '2026-09-20', '2026-09-25'),
        (4, 'other', 'Replay window', null, null,
         '2026-09-26', '2026-09-28')
      ) as v(position, stage_type, name, promo_start, promo_end,
             live_start, live_end)
      where l.name = 'Autumn challenge'
      on conflict do nothing;
    `);
  });

  test.afterAll(async () => {
    await db(`
      delete from public.report_launch_stages
       where name in ('Sales week', 'Replay window')
         and launch_id = (select id from public.report_launches
                           where name = 'Autumn challenge');
      delete from public.report_targets
       where workspace_id = (select id from public.report_workspaces
                              where business_name = '${RETAINER}');
      delete from public.report_launches
       where name in ('Evergreen mastermind', 'Winter workshop');
      update public.report_workspaces set target_hourly_rate = null
       where business_name = '${RETAINER}';
      delete from public.report_values
       where entity_id in (
         select id from public.report_entities
          where entity_type = 'offer'
            and name in ('Signature Programme', 'The Membership',
                         'VIP Day', 'Done-with-you Launch')
       );
      -- The grids the fixture wrote, before the offers they point at:
      -- a sales row holds its offer by foreign key, and an offer with a
      -- row against it cannot be deleted (which is rule 7 doing its job
      -- rather than a problem).
      delete from public.report_actuals
       where sales_row_id in (
         select id from public.report_sales_rows
          where name in ('Signature Programme', 'The Membership', 'VIP Day',
                         'Done-with-you Launch', 'Retainer clients')
       );
      delete from public.report_sales_rows
       where name in ('Signature Programme', 'The Membership', 'VIP Day',
                      'Done-with-you Launch', 'Retainer clients');
      delete from public.report_expenses
       where category_id in (
         select id from public.report_expense_categories
          where name in ('Software and subscriptions', 'Ads and contractors', 'The team')
       );
      delete from public.report_expense_categories
       where name in ('Software and subscriptions', 'Ads and contractors', 'The team');
      delete from public.report_entities
       where entity_type = 'offer'
         and name in ('Signature Programme', 'The Membership',
                      'VIP Day', 'Done-with-you Launch');
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
    ];

    /**
     * **The money series moved off `report_values`** on 13 November:
     * other income is a client row on the Actual grid, and the three
     * cost lines are categories on the expense grid. Same figures, same
     * climb, same wobble — written into the tables the screens read.
     */
    const GRID_SERIES: [string, "client" | "fixed" | "variable" | "team", number, number][] = [
      ["Retainer clients", "client", 400, 900],
      ["Software and subscriptions", "fixed", 300, 300],
      ["Ads and contractors", "variable", 180, 250],
      ["The team", "team", 380, 500],
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

    // The same twelve months, on the two grids.
    const figure = (start: number, end: number, i: number) => {
      const t = i / (span.length - 1);
      const raw = start + (end - start) * t;
      return i === span.length - 1 ? end : Math.round(raw * wobble[i]);
    };

    const ws = `(select id from public.report_workspaces where business_name = '${RETAINER}')`;
    for (const [name, kind, start, end] of GRID_SERIES) {
      const cells = span
        .map((month, i) => `('${month}', ${figure(start, end, i)})`)
        .join(",");

      if (kind === "client") {
        await db(`
          insert into public.report_sales_rows (workspace_id, name, row_type, recurrence)
          select ${ws}, '${name}', 'client', 'monthly'
           where not exists (select 1 from public.report_sales_rows
                              where workspace_id = ${ws} and name = '${name}');
          insert into public.report_actuals (workspace_id, sales_row_id, month, amount)
          select ${ws}, r.id, c.month::date, c.amount
            from public.report_sales_rows r
            cross join (values ${cells}) as c(month, amount)
           where r.workspace_id = ${ws} and r.name = '${name}'
          on conflict do nothing;
        `);
      } else {
        await db(`
          insert into public.report_expense_categories (workspace_id, name, bucket)
          select ${ws}, '${name}', '${kind}'
           where not exists (select 1 from public.report_expense_categories
                              where workspace_id = ${ws} and name = '${name}');
          insert into public.report_expenses
            (workspace_id, category_id, month, amount, bucket)
          select ${ws}, c.id, m.month::date, m.amount, '${kind}'
            from public.report_expense_categories c
            cross join (values ${cells}) as m(month, amount)
           where c.workspace_id = ${ws} and c.name = '${name}'
          on conflict do nothing;
        `);
      }
    }
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
    await page.goto(`/reporting?month=${SHOT_MONTH}`);
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

    // **Each sparkline wears its own card's disc colour** (Dom, 30 Oct),
    // in the darkened ink that clears 3:1 — never the disc's own fill,
    // which for gold is 1.41:1 and would be a line present in the DOM and
    // absent from the screen. Read off the rendered strokes, because the
    // two ways this breaks are both invisible in a screenshot: a mapping
    // that quietly falls back to one colour for every card, and one that
    // reaches for the brand variables instead of the inks.
    const inks = await page.evaluate(() =>
      [...document.querySelectorAll('svg[aria-label*="over the last"] polyline')].map(
        (line) => line.getAttribute("stroke"),
      ),
    );
    expect(inks.length).toBeGreaterThan(2);
    // The three of `LINE_SERIES`, and nothing else. The disc rotation is
    // gold, blush, sky, orange, so a six-across row uses all three.
    expect([...new Set(inks)].sort()).toEqual(
      ["#688fb0", "#e56135", "var(--aos-navy)"],
    );

    // **The header art, and everything the header draws near it.**
    //
    // The photograph is pinned to the top of the header and runs off the
    // right of the window, so two of its sides are the edge of the page and
    // the other two are a mask. If the mask ever stops applying there is a
    // hard rectangle in the corner and nothing else says so, so check it is
    // there — and then check the thing it exists to protect, which is
    // whether the words near it can still be read.
    //
    // It is drawn at full strength since 1 November, and what pays for that
    // is that no text is inside its box: the brand line moved into the title
    // block and the controls sit below the picture. Both halves of that are
    // asserted here — the geometry, so a layout change cannot quietly put
    // words back over a photograph, and the contrast, so a crop or a mask
    // that crept outwards is caught by the number rather than by eye.
    if (info.project.name !== "phone") {
      const art = page.locator("header [data-header-art]");
      await expect(art).toHaveCSS("position", "absolute");
      const mask = await art.evaluate((el) => getComputedStyle(el).maskImage);
      expect(mask, "the header art's mask").toContain("radial-gradient");

      const line = page.getByText("Where strategy meets la dolce vita");
      await expect(line).toBeVisible();
      // Asserted so the share below cannot drift from the share drawn:
      // measuring 70% while the page paints 80% would be a kinder number
      // than the screen's, and kind is the wrong direction for this one.
      await expect(line).toHaveClass(/text-ink\/80/);

      // Clear of the picture, not merely legible over it. Boxes, because
      // "is it over the photograph" is a question about rectangles and
      // nothing in a class name answers it.
      const artBox = (await art.boundingBox())!;
      const lineBox = (await line.boundingBox())!;
      expect(
        lineBox.x + lineBox.width <= artBox.x + 1 || lineBox.y + lineBox.height <= artBox.y + 1,
        "the brand line is outside the photograph's box",
      ).toBe(true);

      // 22px — normal text by WCAG's reckoning, so 4.5:1 and not 3:1.
      const worst = await worstContrastBehind(page, line, 0.8);
      expect(worst, "the brand line over the photograph").toBeGreaterThanOrEqual(4.5);

      // **The way out of the tool, measured on the same evidence.** It is
      // the nearest piece of real text to the picture now, 14px and so
      // owed 4.5:1 as well, and the bottom of the fade is exactly where it
      // sits. Stronger stops in the mask would show up here first.
      // Found by its text rather than its role: the measurement hides the
      // element for one screenshot, and a `visibility: hidden` element is
      // out of the accessibility tree, so a role locator stops matching
      // halfway through and waits for it forever.
      const signOut = page.locator("header button", { hasText: "Sign out" });
      const worstSignOut = await worstContrastBehind(page, signOut, 0.7);
      expect(worstSignOut, "Sign out below the photograph").toBeGreaterThanOrEqual(4.5);
    } else {
      // Below `sm` the photograph is not drawn — **and not fetched.** A
      // server component cannot know the width, so the box is
      // `display: none` rather than absent; what makes that free is that a
      // lazily-loaded image with no box never intersects the viewport, so
      // the bytes never leave the server. `priority` on it would have
      // preloaded a photograph to every phone that is not going to show
      // one, and nothing on the screen would have said so.
      const asked: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("terrazza")) asked.push(r.url());
      });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Monthly Report" })).toBeVisible();
      await expect(page.locator("header img")).toBeHidden();
      expect(asked, "the header photograph, fetched by a phone").toEqual([]);
      // The words stay: they still read at 390px, and they are the half of
      // this that carries the brand rather than the mood.
      await expect(page.getByText("Where strategy meets la dolce vita")).toBeVisible();
    }

    await shot(page, "1-overview", width(info.project.name));
  });

  test("2 — the Social Media report", async ({ page }, info) => {
    await page.goto(`/reporting/social-media?month=${SHOT_MONTH}`);
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
    await page.goto(`/reporting/enter/social-media?month=${SHOT_MONTH}`);
    await expect(page.getByRole("heading", { name: "Enter your data" })).toBeVisible();
    // The mockups' progress bar, which is the entry screen's own furniture.
    await expect(page.getByText(/sections complete/)).toBeVisible();
    await shot(page, "3-social-media-entry", width(info.project.name));
  });

  test("4 — Offers", async ({ page }, info) => {
    await page.goto(`/reporting/offers?month=${SHOT_MONTH}`);
    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
    // The mockups' pill, on both kinds.
    await expect(page.getByText("One-off").first()).toBeVisible();
    await expect(page.getByText("Recurring").first()).toBeVisible();

    // **A card per offer, with its price as it is sold** (Phase 4). The
    // recurring one says so in the price line, which is the thing a
    // table of monthly figures could not say at all.
    await expect(page.getByRole("heading", { name: "The Membership" })).toBeVisible();
    await expect(page.getByText("£250").first()).toBeVisible();
    await expect(page.getByText("/ month").first()).toBeVisible();

    // **The margin ring is on a 0-100 scale.** `percentage()` returns 87
    // for 87%, and the first ring multiplied by 100 again and drew
    // "8700%" on every card — a bug a screenshot shows and no assertion
    // about the figures would have. Signature Programme: £10,000 revenue,
    // 20 hours at £45 plus £400 other costs is £1,300, so 87%.
    const rings = page.locator('svg[aria-label^="Margin"]');
    await expect(rings).toHaveCount(4);
    await expect(rings.filter({ hasText: "87%" })).toHaveCount(1);
    const overHundred = await page.evaluate(
      () =>
        [...document.querySelectorAll('svg[aria-label^="Margin"] text')].filter(
          (t) => Number((t.textContent ?? "").replace("%", "")) > 100,
        ).length,
    );
    expect(overHundred, "a margin over 100% is the scale being wrong twice").toBe(0);

    // The hourly-rate target line, and the warning on the offers under it.
    await expect(page.getByText("Target £200 an hour")).toBeVisible();
    await expect(
      page.getByText("Below your £200 an hour target").first(),
    ).toBeVisible();

    // **Green unless the offer is below the hourly-rate target** (Nina,
    // 30 Oct). Two of the four are: The Membership at £196 an hour and
    // Done-with-you Launch at £162, against a £200 target. Read off the
    // rendered stroke, because the way this breaks is a condition that
    // is always true or always false — which draws four rings of one
    // colour and looks perfectly deliberate in a screenshot.
    const ringInk = await page.evaluate(() =>
      [...document.querySelectorAll('svg[aria-label^="Margin"]')].map((svg) => {
        const arc = [...svg.querySelectorAll("circle")].find((c) =>
          c.hasAttribute("stroke-dasharray"),
        );
        const name = svg.closest("section")?.querySelector("h3")?.textContent ?? "";
        return [name, arc?.getAttribute("stroke") ?? null] as const;
      }),
    );
    expect(Object.fromEntries(ringInk)).toEqual({
      "Signature Programme": "#1f7a4d",
      "The Membership": "#e56135",
      "VIP Day": "#1f7a4d",
      "Done-with-you Launch": "#e56135",
    });

    // Six months of revenue, one bar per offer per month.
    await expect(page.getByText("Revenue by offer")).toBeVisible();
    await expect(
      page.getByRole("img", { name: /across 6 months/ }),
    ).toBeVisible();
    await expect(page.getByText(/months of figures are needed/)).toHaveCount(0);

    // A card for each of the four, so the row is the row the mockup draws
    // and not three with one underneath.
    for (const name of ["Signature Programme", "The Membership", "VIP Day",
                        "Done-with-you Launch"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    // Each offer keeping one colour across the donut, the bars and the
    // six-month chart is checked where the logic is, in
    // `chart-data.test.ts` — the bars are sorted by rate and the donut is
    // in the offers' own order, so a colour following a row's position
    // would disagree with itself on this screen.

    await shot(page, "4-offers", width(info.project.name));
  });

  test("5 — Launches", async ({ page }, info) => {
    await page.goto("/reporting/launches");
    await expect(page.getByText(RETAINER).first()).toBeVisible();
    // The cover the fixture put on Autumn challenge. Decorative, so it has
    // an empty alt and is found by its source rather than by a name.
    const cover = page.locator('img[src*="launch-covers"]').first();
    await expect(cover).toBeVisible();

    // **The cover is a small landscape thumbnail, not a band down the
    // card** (Dom, 30 Oct), and the name it makes room for sits on one
    // line. Both measured on the rendered card, because both are about
    // pixels: a screenshot shows them and no ordinary assertion does.
    const box = await cover.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(box!.height);
    expect(box!.height).toBeLessThan(80);

    // One line: the heading link's height is within a line-and-a-bit of
    // its own font size. A wrapped serif h3 is roughly double.
    const name = page.getByRole("link", { name: "Autumn challenge" });
    const lines = await name.evaluate((el) => {
      const style = getComputedStyle(el);
      // An inline <a>: getClientRects() gives one rect per line box, which
      // is the question asked directly rather than inferred from heights.
      return { rects: el.getClientRects().length, size: style.fontSize };
    });
    expect(lines.rects, `"Autumn challenge" wrapped (${lines.size})`).toBe(1);

    await shot(page, "5-launches", width(info.project.name));
  });

  /** The six headline cards of the launch page, in the order they sit. */
  const headlineLabels = [
    "Total sales",
    "Total revenue",
    "Still to collect",
    "Average order value",
    "Conversion rate",
    "Cash collected",
  ];

  test("6 — a launch, opened", async ({ page }, info) => {
    // The list is where the launch cards live; this is the page behind
    // one of them, and Nina reads it far more often than she reads the
    // list (Dom, 30 Oct).
    await page.goto("/reporting/launches");
    await page.getByRole("link", { name: "Autumn challenge" }).click();
    await expect(
      page.getByRole("heading", { name: "Autumn challenge" }),
    ).toBeVisible();
    // Its figures, so the screenshot is of a launch with something in it
    // rather than of an empty frame that happens to have loaded.
    await expect(page.getByText(/sold/).first()).toBeVisible();

    // **"How it ran" is a horizontal timeline on desktop and a stacked
    // list on the phone** (Nina, 30 Oct). Measured rather than asserted
    // from a class name: a flex direction that does not take is a class
    // present in the DOM and a layout that never changed.
    const howItRan = page.locator("section", { hasText: "How it ran" }).last();
    await expect(howItRan).toBeVisible();
    const steps = howItRan.locator("ol > li");
    await expect(steps).toHaveCount(4);
    const first = await steps.first().boundingBox();
    const last = await steps.last().boundingBox();
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    if (info.project.name === "phone") {
      expect(last!.y, "the stages should stack at 390px").toBeGreaterThan(first!.y);
    } else {
      // Same row: their tops are within a few pixels of each other, and
      // the last one is well to the right of the first.
      expect(Math.abs(last!.y - first!.y), "the stages should share a row").toBeLessThan(4);
      expect(last!.x).toBeGreaterThan(first!.x + first!.width);
    }

    // **"Who turned up" is the funnel now**, signed up → attended live →
    // stayed to the pitch → bought, with the share at each step.
    const masterclass = page
      .locator("section", { hasText: "The masterclass: who turned up" })
      .last();
    for (const step of ["Signed up", "Attended live", "Stayed to the pitch", "Bought"]) {
      await expect(masterclass.getByText(step, { exact: true })).toBeVisible();
    }
    // 900 → 600 → 430 → 30, and the share at each step. Asserted on the
    // row rather than on the page, because 430 is also the figure in the
    // sentence underneath — and a funnel row carrying the right number
    // with the wrong percentage beside it is the failure worth catching.
    // 72% is 430 of 600, the step above it: get the denominator wrong
    // and this is the figure that moves.
    await expect(
      masterclass.locator("li", { hasText: "Signed up" }),
    ).toContainText("900");
    const stayed = masterclass.locator("li", { hasText: "Stayed to the pitch" });
    await expect(stayed).toContainText("430");
    await expect(stayed).toContainText("72%");

    // **The funnel's second share IS the Conversion rate card's figure**
    // (Nina, 30 October). The funnel measures each step against the step
    // above it, so "Bought" on its own reads 7% — of those still in the
    // room — while the card at the top of the page reads 3.3%, sales over
    // sign-ups to the main selling stage, which is what decision 19
    // settled. Both are true, and a row showing only the first makes the
    // card look broken.
    //
    // Read off the page and compared, not asserted as 3.3% twice: what
    // is being tested is that the two agree, and a test naming the number
    // would pass just as happily with the page computing it in two places
    // and rounding them apart.
    const cardRate = await page.evaluate(() => {
      const label = [...document.querySelectorAll("span")].find(
        (el) => el.textContent?.trim() === "Conversion rate",
      );
      // Walk up to whichever ancestor holds the figure. A KPI card is a
      // plain `div`, not a `section`, so there is no tag to aim at.
      let el: Element | null | undefined = label?.parentElement;
      while (el && !el.querySelector(":scope > p")) el = el.parentElement;
      return el?.querySelector(":scope > p")?.textContent?.trim() ?? "";
    });
    expect(cardRate, "the Conversion rate card").toMatch(/^\d+(\.\d+)?%$/);
    const bought = masterclass.locator("li", { hasText: "Bought" });
    await expect(bought).toContainText("of the pitch");
    await expect(bought).toContainText(`${cardRate} of sign-ups`);

    // **And both figures fit beside the funnel at 390px.** The first
    // version of this row did not: "7% of those at the pitch" ran into
    // the figure on its left and squeezed the label down to "B", with
    // every element still present and still "visible" to an assertion.
    // So the check is on the geometry — nothing in the row overlaps the
    // figure, and the label is wide enough to be a word.
    const boughtFits = await bought.evaluate((li) => {
      const [left, right] = [...li.children] as HTMLElement[];
      const label = left.lastElementChild as HTMLElement;
      return {
        gap: right.getBoundingClientRect().left - left.getBoundingClientRect().right,
        label: label.getBoundingClientRect().width,
        text: label.textContent ?? "",
      };
    });
    expect(boughtFits.gap, "the shares run into the figure").toBeGreaterThan(0);
    expect(boughtFits.text).toBe("Bought");
    expect(boughtFits.label, '"Bought" is squeezed to nothing').toBeGreaterThan(40);

    // **Only the main selling stage gets a "Bought" step.** There is no
    // per-stage sales figure, so the five day challenge — which is not
    // the selling stage — must not sprout one from the launch total.
    const challenge = page
      .locator("section", { hasText: "Five day challenge: who turned up" })
      .last();
    await expect(challenge.getByText("Bought", { exact: true })).toHaveCount(0);
    // It keeps its day-by-day bars, because it ran for five days and they
    // answer a different question. The masterclass ran for one and does
    // not get a chart of a single bar.
    await expect(challenge.getByText("Day 5", { exact: true })).toBeVisible();
    await expect(masterclass.getByText("Day 1", { exact: true })).toHaveCount(0);

    // **A disc on all six headline cards and on every panel title**, as on
    // every other screen in the report.
    //
    // Asked of each one rather than counted. A count is the assertion that
    // looks right and is not: this page carries a dozen discs on its panel
    // titles alone, so dropping all six from the cards leaves a total that
    // still clears any threshold worth setting. Both checks lean on the
    // same fact — a disc is rendered immediately before the thing it
    // belongs to, and `aria-hidden`, which is how they are found at all.
    const cardsWithoutDisc = await page.evaluate((labels: string[]) => {
      const discBefore = (el: Element | null) =>
        el?.getAttribute("aria-hidden") === "true" && el.querySelector("svg") !== null;
      return labels.filter((label) => {
        const span = [...document.querySelectorAll("span")].find(
          (el) => el.textContent?.trim() === label,
        );
        return !span || !discBefore(span.previousElementSibling);
      });
    }, headlineLabels);
    expect(cardsWithoutDisc, "headline cards with no disc").toEqual([]);

    const titlesWithoutDisc = await page.evaluate(() =>
      [...document.querySelectorAll("h2")]
        .filter((h) => {
          const before = h.previousElementSibling;
          return !(
            before?.getAttribute("aria-hidden") === "true" && before.querySelector("svg")
          );
        })
        .map((h) => h.textContent?.trim() ?? ""),
    );
    expect(titlesWithoutDisc, "panel titles with no disc").toEqual([]);

    await shot(page, "6-launch-detail", width(info.project.name));
  });
});
