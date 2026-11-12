import { mkdirSync } from "node:fs";

import { test, type Page } from "@playwright/test";

import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * Every screen in the reporting tool, both widths, in one folder.
 *
 * **For a person to look through, not for an assertion to pass.** Dom,
 * 13 November: the set is the deliverable. So it is one spec that walks
 * the tool in the order somebody uses it — enter a month, then read the
 * report of it — and the files are numbered so the folder scrolls in
 * that order.
 *
 * It fills the three sections the seed leaves empty first (Social
 * Media, Email, Offers). A review set of "Nothing in yet" cards shows
 * the empty states, which have their own tests; what this is for is the
 * screens with figures on them.
 */

requireLocalStack();

const FOLDER = "docs/screen-sweep";

const shoot = async (page: Page, name: string, width: string) => {
  mkdirSync(FOLDER, { recursive: true });
  // The whole page: what is below the fold is most of what there is to
  // review, and a viewport shot would hide the half that changed.
  await page.screenshot({ path: `${FOLDER}/${name}-${width}.png`, fullPage: true });
};

/** The sections, in tab order, with the slug each route uses. */
const SECTIONS = [
  { slug: "overview", name: "overview", entry: false },
  { slug: "social-media", name: "social-media", entry: true },
  { slug: "trial-reels", name: "trial-reels", entry: true },
  { slug: "email", name: "email", entry: true },
  { slug: "funnels", name: "funnels", entry: true },
  { slug: "leads-conversions", name: "leads", entry: true },
  { slug: "ads", name: "ads", entry: true },
  { slug: "client-experience", name: "client-experience", entry: true },
  { slug: "offers", name: "offers", entry: true },
  { slug: "financials", name: "financials", entry: true },
];

test("every section, entry and report, at both widths", async ({ page }, info) => {
  test.setTimeout(240_000);
  const width = info.project.name === "phone" ? "phone" : "desktop";
  const { seed, sql, MONTHS, RETAINER } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  /**
   * The three sections the seed leaves empty, filled straight into the
   * database rather than through their screens.
   *
   * Those screens have their own tests; what this spec is for is the
   * look of a month with figures in it, and thirty fields typed through
   * a browser is thirty chances for this to fail for a reason that has
   * nothing to do with what it is showing.
   */
  sql(`
    do $$
    declare
      v_ws uuid;
      v_nina uuid;
      v_platform uuid;
      v_offer uuid;
    begin
      select id into v_ws from public.report_workspaces where business_name = '${RETAINER}';
      select id into v_nina from public.members where email = 'nina@aos.test';
      select id into v_platform from public.report_entities
       where workspace_id = v_ws and entity_type = 'social_platform' limit 1;
      select id into v_offer from public.report_entities
       where workspace_id = v_ws and entity_type = 'offer' limit 1;

      insert into public.report_values (workspace_id, month, metric_key, value, entity_id, entered_by)
      values
        (v_ws, '${MONTHS.sep}', 'social_media_followers_at_month_end', 4820, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_reach', 61000, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_likes_plus_comments', 1840, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_saves', 410, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_shares', 190, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_posts_published', 18, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_profile_visits', 2200, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'social_media_follows_gained', 260, v_platform, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_list_size_at_month_end', 3410, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_new_subscribers', 280, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_unsubscribes', 35, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_emails_sent', 9, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_average_open_rate', 44.2, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'email_average_click_rate', 3.8, null, v_nina),
        (v_ws, '${MONTHS.sep}', 'offers_units_sold', 6, v_offer, v_nina),
        (v_ws, '${MONTHS.sep}', 'offers_hours_spent_delivering', 32, v_offer, v_nina),
        (v_ws, '${MONTHS.sep}', 'offers_other_direct_costs', 400, v_offer, v_nina)
      -- The table's uniqueness is a partial index per entity, so there
      -- is no conflict target to name. The seed has just run, so these
      -- rows are new anyway.
      ;
    end $$;
  `);

  await signIn(page, "nina");

  // --- the month, as it is entered ----------------------------------------
  // Financials first: its four grids are what the rest of the report
  // reads, so a sweep that shot it last would shoot everything else
  // empty.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  const card = (heading: string) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

  const rows = card("Your rows");
  for (const [name, kind, recurs, offer] of [
    ["Signature programme", "offer", "none", "Signature programme"],
    ["Bella Ltd", "client", "monthly", ""],
    ["Crane & Co", "client", "none", ""],
  ] as const) {
    await rows.getByLabel("Name", { exact: true }).fill(name);
    await rows.getByLabel("What it is").selectOption(kind);
    await rows.getByLabel("Does it recur?").selectOption(recurs);
    if (offer) await rows.getByLabel("Link to an offer").selectOption({ label: offer });
    await rows.getByLabel("Name").press("Enter");
    await page.getByText(new RegExp(`${name.replace("&", "&")} added`, "i")).first().waitFor();
  }

  const came = card("What came in");
  await came.getByLabel(/^Signature programme, September 2026$/).fill("4800");
  await came.getByLabel(/^Bella Ltd, September 2026$/).fill("1200");
  await came.getByLabel(/^Crane & Co, September 2026$/).fill("2400");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await came.getByText(/^Saved\.$/).waitFor();

  const expected = card("What you expect");
  for (const month of ["September", "October", "November", "December"]) {
    await expected.getByLabel(new RegExp(`^Bella Ltd, ${month} 2026$`)).fill("1200");
  }
  await expected.getByRole("button", { name: /save what you expect/i }).click();
  await expected.getByText(/^Saved\.$/).waitFor();

  const categories = card("Your cost categories");
  await categories.getByRole("button", { name: /start with the usual list/i }).click();
  await page.getByText(/categories added/i).waitFor();

  const cost = card("What it cost");
  for (const [name, amount] of [
    ["Software", "320"],
    ["Subscriptions", "140"],
    ["Ads", "600"],
    ["Staff", "1800"],
    ["Accounts", "95"],
  ] as const) {
    await cost.getByLabel(new RegExp(`^${name}, September 2026$`)).fill(amount);
  }
  await cost.getByRole("button", { name: /save what it cost/i }).click();
  await cost.getByText(/^Saved\.$/).waitFor();

  const team = card("Who does the work");
  for (const [name, rate] of [
    ["Anna", "38"],
    ["Priya", "52"],
  ] as const) {
    // Exact: once somebody is on the list their own row has a "Name of
    // Anna" and an "Hourly rate for Anna" in it, and the add form's
    // fields are the ones being filled here.
    await team.getByLabel("Name", { exact: true }).fill(name);
    await team.getByLabel("Hourly rate", { exact: true }).fill(rate);
    await team.getByRole("button", { name: /add them/i }).click();
    await page.getByText(new RegExp(`${name} added`, "i")).first().waitFor();
  }

  const hours = card("Hours on each client");
  await hours.getByLabel(/^Anna on Bella Ltd, hours$/).fill("9");
  await hours.getByLabel(/^Priya on Bella Ltd, hours$/).fill("3");
  await hours.getByLabel(/^Anna on Crane & Co, hours$/).fill("14");
  await hours.getByRole("button", { name: /save the hours/i }).click();
  await hours.getByText(/^Saved\.$/).waitFor();

  await page.getByLabel(/cash in bank at month end/i).fill("18400");
  await page.getByLabel(/cash in bank at month end/i).blur();
  await page.getByText(/Saved\./).first().waitFor();

  // --- the sweep ----------------------------------------------------------
  let n = 1;
  const next = () => String(n++).padStart(2, "0");

  for (const section of SECTIONS) {
    if (!section.entry) continue;
    await page.goto(`/reporting/enter/${section.slug}?month=${MONTHS.sep}`);
    await page.getByRole("heading", { name: /enter your data/i }).first().waitFor();
    await shoot(page, `${next()}-${section.name}-entry`, width);
  }

  // Launches has its own screens rather than a month of fields.
  await page.goto(`/reporting/launches?month=${MONTHS.sep}`);
  await page.getByRole("heading", { name: /launch/i }).first().waitFor();
  await shoot(page, `${next()}-launches`, width);

  for (const section of SECTIONS) {
    await page.goto(
      section.slug === "overview"
        ? `/reporting?month=${MONTHS.sep}`
        : `/reporting/${section.slug}?month=${MONTHS.sep}`,
    );
    await page.getByRole("heading").first().waitFor();
    await shoot(page, `${next()}-${section.name}-report`, width);
  }

  // And the month as a document, which is the last thing it becomes.
  await page.goto(`/reporting/print?month=${MONTHS.sep}`);
  await page.getByRole("heading", { name: /september 2026/i }).first().waitFor();
  await shoot(page, `${next()}-print`, width);
});
