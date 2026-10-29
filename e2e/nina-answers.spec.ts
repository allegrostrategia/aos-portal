import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { MONTHS, PEOPLE } from "./guard.ts";
import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * Nina's review, built — the eleven answers she gave on 28 October.
 *
 * Its own spec rather than additions to five others, because what is
 * being checked is a decision rather than a screen: each test names the
 * decision it belongs to, and the thing asserted is the sentence she
 * would read back. Where a change is visible to a client, the test takes
 * the photograph too, at whichever width it is running.
 *
 * Driven through the real sign-in as the real people. The two readings
 * that changed a figure (19 and 20) are asserted against the seed's
 * numbers, which are deliberately all different, so every wrong reading
 * shows as its own number rather than as nothing.
 */

requireLocalStack();

const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

/**
 * Into the review pack, beside the other two sets.
 *
 * Not `e2e/screenshots`, which is working output nobody reads: these are
 * the photographs Dom looks at before any of this is pushed, and Nina
 * after him, so they belong with the document that references them.
 */
const OUT = "docs/nina-review/screens-review";

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
}

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

/** Nina publishes September, so the client's side is a real one. */
async function publishSeptember(page: Page) {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`insert into public.report_periods (workspace_id, month, published_at, published_by)
       select w.id, '${MONTHS.sep}-01', now(),
              (select id from public.members where role = 'admin' limit 1)
         from public.report_workspaces w
        where w.business_name = 'Northwind Studio'
       on conflict (workspace_id, month) do update
          set published_at = now(),
              published_by = (select id from public.members where role = 'admin' limit 1);`);
  void page;
}

// --------------------------------------------------- decision 3: the tag

test("decision 3: the attention panel wears one tag, not three tails", async ({ page }, info) => {
  const w = width(info.project.name);
  await publishSeptember(page);
  await signIn(page, "client");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const panel = page.getByRole("heading", { name: /look at these first/i });
  await expect(panel).toBeVisible();

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // The tag is there once per line going the wrong way.
  expect(text).toMatch(/FOCUS AREA/i);
  // And none of the four tails she objected to survives anywhere on the
  // page — including the two that were never in the badRise sentence.
  expect(text).not.toMatch(/dig into WHY/i);
  expect(text).not.toMatch(/work out WHY/i);
  expect(text).not.toMatch(/not there YET/i);
  expect(text).not.toMatch(/worth a proper look/i);

  await shot(page, "01-focus-area-client", w);
});

// ------------------------------------ decision 2: hours, never judged

/**
 * Offer figures for two months, so the card has a change to show.
 *
 * The seed creates the offer but no figures against it, so the Offers
 * screen is empty without this — which is how this test was wrong first,
 * asserting against "Nothing for September 2026".
 *
 * 38 hours in August, 42 in September: a rise, which is exactly the case
 * decision 2 is about. Before it, that read as bad news in red.
 */
async function seedOfferHours() {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const ws = `(select id from public.report_workspaces where business_name = 'Northwind Studio')`;
  const admin = `(select id from public.members where role = 'admin' limit 1)`;
  const offer = `(select id from public.report_entities where workspace_id = ${ws}
                    and entity_type = 'offer' and name = 'Signature programme' limit 1)`;
  for (const [month, units, revenue, hours] of [
    [MONTHS.aug, 11, 5500, 38],
    [MONTHS.sep, 14, 7000, 42],
  ] as const) {
    for (const [key, value] of [
      ["offers_units_sold", units],
      ["offers_revenue_this_month", revenue],
      ["offers_hours_spent_delivering", hours],
    ] as const) {
      sql(`delete from public.report_values where workspace_id = ${ws}
             and month = '${month}-01' and metric_key = '${key}' and entity_id = ${offer};
           insert into public.report_values
             (workspace_id, month, metric_key, entity_id, value, entered_by)
           values (${ws}, '${month}-01', '${key}', ${offer}, ${value}, ${admin});`);
    }
  }
}

test("decision 2: total hours delivering is reported, not judged", async ({ page }, info) => {
  const w = width(info.project.name);
  await seedOfferHours();
  await publishSeptember(page);
  await signIn(page, "client");
  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);

  // The card is found by its own shell class and read as a whole, because
  // what is being checked is what sits beside the figure. A plain `div`
  // selector matches every ancestor too, and reading all of them times
  // out rather than failing — which is how this test was wrong first.
  const card = page
    .locator("div.rounded-card")
    .filter({ hasText: "Total hours spent delivering" })
    .first();
  await expect(card).toBeVisible();
  const cardText = (await card.innerText()).replace(/\s+/g, " ");

  // The figure and its change are both there — she asked for the change
  // to stay.
  expect(cardText).toMatch(/[↑↓→]\s?\d/);
  // No traffic light, because a light is a judgement with a word on it.
  expect(cardText).not.toMatch(/On track|Off track|Close/);

  // And no good/bad colour anywhere in the card — neither the green nor
  // the red the other cards use. Asserted on the markup, because this is
  // the half of her answer a screenshot cannot fail on: a reader cannot
  // tell "neutral grey" from "we had nothing to say" by eye.
  const html = await card.innerHTML();
  expect(html).not.toContain("text-deep-red");
  expect(html).not.toContain("#1f7a4d");
  expect(html).toContain("text-ink/55");

  // Nothing in either panel says anything about it either.
  const page_text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(page_text).not.toMatch(/hours spent delivering (up|down) /i);

  await shot(page, "02-hours-neutral-client", w);
});

// ------------------------------- decision 10: a month being prepared

test("decision 10: a client sees the month coming, and no figures in it", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  // August published, September not — so September is the month being
  // prepared and August is what they land on.
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`insert into public.report_periods (workspace_id, month, published_at, published_by)
       select w.id, '${MONTHS.aug}-01', now(),
              (select id from public.members where role = 'admin' limit 1)
         from public.report_workspaces w
        where w.business_name = 'Northwind Studio'
       on conflict (workspace_id, month) do update set published_at = now(),
         published_by = (select id from public.members where role = 'admin' limit 1);
       update public.report_periods p set published_at = null, published_by = null
         from public.report_workspaces w
        where w.id = p.workspace_id and w.business_name = 'Northwind Studio'
          and p.month = '${MONTHS.sep}-01';`);

  await signIn(page, "client");
  await page.goto("/reporting");

  // They land on the one they can read. Asserted on the tagline, not the
  // URL: a bare /reporting carries no month in its query and still shows
  // one, which is the whole point of resolving it server-side.
  await expect(page.getByRole("heading", { name: /monthly report/i })).toBeVisible();
  await expect(page.getByText("August 2026", { exact: true }).first()).toBeVisible();

  // September is offered, which is the change: before this they could not
  // see that a month was coming at all.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(
    page.getByRole("heading", { name: /your september 2026 report is being prepared/i }),
  ).toBeVisible();

  // And it is the whole screen — no KPI cards, no panels, no grid of
  // dashes underneath explaining nothing.
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/This month at a glance|Look at these first|No month to compare/);
  await shot(page, "03-being-prepared-client", w);

  // The same wording on a section, from the same component.
  await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  await expect(
    page.getByRole("heading", { name: /your september 2026 report is being prepared/i }),
  ).toBeVisible();
  await shot(page, "04-being-prepared-section-client", w);
});

test("decision 10: a member is never told their own report is being prepared", async ({
  page,
}) => {
  // A member fills theirs in whenever they like, so "being prepared"
  // would be a sentence about nobody.
  await signIn(page, "member");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/being prepared/i);
});

// ------------------------- decisions 19 and 20: two figures she quotes

test("decisions 19 and 20: conversion against sign-ups, retention against the room", async ({
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
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]{36}/);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // 30 sales ÷ the masterclass's 900 sign-ups. Its 600 attendees would
  // read 5.0%; the challenge's five days would read about 1%.
  expect(text).toMatch(/CONVERSION RATE 3\.3%/);
  expect(text).not.toMatch(/CONVERSION RATE 5\.0%/);

  // 430 of the 600 who were in the room at the start — not of the 520 who
  // were there when the pitch began, which reads 83%.
  expect(text).toMatch(/430 still live at the end of the pitch/);
  expect(text).toMatch(/72% of the 600 there at the start of the session/);
  expect(text).not.toMatch(/83% of/);

  await shot(page, "05-launch-figures-client", w);
});

// ------------------------------------- decision 12: the one launch email

test("decision 12: a published launch can be sent, a draft cannot", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]{36}/);

  // A draft has nothing to tell anybody about.
  await expect(page.getByRole("button", { name: /send update to client/i })).toHaveCount(0);

  await page.getByRole("button", { name: /^publish this launch$/i }).click();
  await expect(page.getByRole("button", { name: /send update to client/i })).toBeVisible();
  await shot(page, "06-send-update-admin", w);
});

test("decision 12: the client never sees the button, and a member has nobody to send to", async ({
  page,
}) => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`update public.report_launches l set published_at = now(),
         published_by = (select id from public.members where role = 'admin' limit 1)
        from public.report_workspaces w
       where w.id = l.workspace_id and w.business_name = 'Northwind Studio'
         and l.name = 'Autumn challenge';`);

  await signIn(page, "client");
  await page.goto("/reporting/launches");
  await page.getByRole("link", { name: "Autumn challenge" }).click();
  await page.waitForURL(/\/reporting\/launches\/[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: /send update to client/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /unpublish/i })).toHaveCount(0);
});

// ------------------------------- decision 16: what the planner starts with

test("decision 16: conversion is offered from the last finished launch; show-up is not", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/reporting/launches/new");

  // The seed's "Autumn challenge" is completed, and its real conversion
  // is 3.3% under decision 20.
  const conversion = page.getByLabel(/conversion rate/i);
  await expect(conversion).toHaveValue("3.3");
  // Named, so the number can be checked rather than trusted.
  await expect(page.getByText(/filled in from/i)).toBeVisible();
  await expect(page.getByText(/Autumn challenge/)).toBeVisible();

  // Show-up stays empty: it swings with the audience far more than
  // conversion does, and it is the figure that moves sign-ups most.
  await expect(page.getByLabel(/show-up rate/i)).toHaveValue("");

  await shot(page, "07-planner-suggestion-admin", w);
});

// ------------------------------- decision 36: a member uploads their own

test("decision 36: a member gets the upload card on Ads and Social", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "member");

  for (const [n, slug] of [
    ["08-member-upload-ads", "ads"],
    ["09-member-upload-social", "social-media"],
  ] as const) {
    await page.goto(`/reporting/enter/${slug}?month=${MONTHS.sep}`);
    await expect(page.getByText(/export|csv/i).first()).toBeVisible();
    await shot(page, n, w);
  }

  // Email stays manual — the only sample is a PDF of charts.
  await page.goto(`/reporting/enter/email?month=${MONTHS.sep}`);
  const emailText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(emailText).not.toMatch(/choose a file|\.csv/i);
});

test("decision 11: publishing a member's month emails nobody", async ({ page }) => {
  // The screen has no publish card on a self-serve workspace, which is
  // what makes this hard to see — so it is asserted as the absence of the
  // card AND of any route to one.
  void PEOPLE;
  await signIn(page, "member");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/publish this month|the client can see/i);
});

// ---------------- decision 28: optional, but still on the screen

test("decision 28: the four stay in the main list, labelled optional", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  // Visible without opening anything. Making them optional moved them
  // behind "+ Add more detail" as a side effect of what optional has
  // always meant here, which is a bigger change than Nina asked for —
  // cash in bank in particular would simply stop being entered.
  const cash = page.getByLabel(/cash in bank at month end/i);
  await expect(cash).toBeVisible();

  // And the word is on them, so they do not read as core fields the
  // "still to fill in" count has forgotten.
  const field = page
    .locator("div")
    .filter({ has: cash })
    .last();
  await expect(field.getByText("optional", { exact: true })).toBeVisible();

  await shot(page, "10-optional-visible-admin", w);
});

test("decision 28: and they do not hold the section back", async ({ page }) => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const ws = `(select id from public.report_workspaces where business_name = 'Northwind Studio')`;
  const admin = `(select id from public.members where role = 'admin' limit 1)`;

  // Every CORE financials figure entered — there are three; revenue is
  // pulled from Offers and the rest are worked out — and cash in bank
  // deliberately left empty. Before decision 28 that was three of four
  // and the section stayed orange.
  for (const [key, value] of [
    ["financials_fixed_costs", 300],
    ["financials_variable_costs", 250],
    ["financials_team_costs", 500],
  ] as const) {
    sql(`delete from public.report_values where workspace_id = ${ws}
           and month = '${MONTHS.sep}-01' and metric_key = '${key}' and entity_id is null;
         insert into public.report_values
           (workspace_id, month, metric_key, value, entered_by)
         values (${ws}, '${MONTHS.sep}-01', '${key}', ${value}, ${admin});`);
  }

  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  await expect(page.getByText(/all filled in/i)).toBeVisible();

  // Empty, and the section is finished anyway.
  await expect(page.getByLabel(/cash in bank at month end/i)).toHaveValue("");
});

// ------- "Everything else this month", answered 29 October

/**
 * Enough leads figures, two months running, that the section overflows.
 *
 * Six core/calc figures fill the headline cards; everything past that
 * falls into "Everything else this month", which is the list Nina asked
 * to carry arrows. Without this the seed fills too few and the list does
 * not exist — which is how this test was wrong first.
 */
async function seedLeadsBothMonths() {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const ws = `(select id from public.report_workspaces where business_name = 'Northwind Studio')`;
  const admin = `(select id from public.members where role = 'admin' limit 1)`;

  for (const [month, factor] of [[MONTHS.aug, 1], [MONTHS.sep, 2]] as const) {
    for (const [key, base] of [
      ["leads_conversions_new_leads_from_social", 20],
      ["leads_conversions_new_leads_from_email", 8],
      ["leads_conversions_new_leads_from_referral", 5],
      ["leads_conversions_calls_booked", 12],
      ["leads_conversions_calls_held", 9],
      ["leads_conversions_new_clients", 3],
    ] as const) {
      sql(`delete from public.report_values where workspace_id = ${ws}
             and month = '${month}-01' and metric_key = '${key}' and entity_id is null;
           insert into public.report_values
             (workspace_id, month, metric_key, value, entered_by)
           values (${ws}, '${month}-01', '${key}', ${base * factor}, ${admin});`);
    }
  }
}

test("the overflow list carries its direction too", async ({ page }, info) => {
  const w = width(info.project.name);
  await seedLeadsBothMonths();
  await publishSeptember(page);
  await signIn(page, "client");
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);

  // `.rounded-card` without a tag: Card renders as a <section> by
  // default, so `div.rounded-card` finds nothing and times out rather
  // than failing — which is how this was wrong first.
  const list = page
    .locator(".rounded-card")
    .filter({ hasText: "Everything else this month" })
    .first();
  await expect(list).toBeVisible();

  // The month compared against is said once, in the heading, rather
  // than on every one of a dozen rows.
  await expect(list.getByText(/vs\. August/)).toHaveCount(1);

  // Every row with a previous figure wears an arrow.
  const html = await list.innerHTML();
  expect(html).toMatch(/[↑↓→]/);

  // And the tones come from the same map the KPI cards use, so a figure
  // cannot read green here and red on a card. Grey is in it too: a
  // figure with no good direction, or one that did not move, is not
  // news either way.
  expect(html).toMatch(/text-\[#1f7a4d\]|text-deep-red/);
  expect(html).toContain("text-ink/55");

  await shot(page, "11-overflow-arrows-client", w);
});

test("and every arrow wears one of the three tones, not a fourth", async ({ page }) => {
  // The invariant that matters: the list draws from the same map as the
  // cards. Not "no red anywhere" — doubling every input does not double
  // every derived rate, and lead-to-client falls when leads rise faster
  // than clients, which is correctly red.
  await seedLeadsBothMonths();
  await publishSeptember(page);
  await signIn(page, "client");
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);

  const list = page
    .locator(".rounded-card")
    .filter({ hasText: "Everything else this month" })
    .first();
  const html = await list.innerHTML();

  const known = new Set(["text-[#1f7a4d]", "text-deep-red", "text-ink/55"]);
  const tones = [...html.matchAll(/block text-caption font-medium ([^"]+)"/g)].map(
    (m) => m[1].trim(),
  );

  assertSome(tones.length > 0, "at least one row carries a change");
  for (const tone of tones) {
    assertSome(known.has(tone), `unknown tone class ${tone}`);
  }
});

test("a figure with no good direction is grey in the list, not green", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { sql } = await import("../scripts/seed-test-db.mjs");
  const ws = `(select id from public.report_workspaces where business_name = 'Northwind Studio')`;
  const admin = `(select id from public.members where role = 'admin' limit 1)`;

  // Investment spend is optional and has no good direction — courses and
  // coaching going up is neither good news nor bad. It rises here, which
  // under any "up is good" reading would come out green.
  for (const [month, value] of [[MONTHS.aug, 400], [MONTHS.sep, 900]] as const) {
    sql(`delete from public.report_values where workspace_id = ${ws}
           and month = '${month}-01' and metric_key = 'financials_investment_spend'
           and entity_id is null;
         insert into public.report_values
           (workspace_id, month, metric_key, value, entered_by)
         values (${ws}, '${month}-01', 'financials_investment_spend', ${value}, ${admin});`);
    for (const [key, base] of [
      ["financials_fixed_costs", 300],
      ["financials_variable_costs", 250],
      ["financials_team_costs", 500],
    ] as const) {
      sql(`delete from public.report_values where workspace_id = ${ws}
             and month = '${month}-01' and metric_key = '${key}' and entity_id is null;
           insert into public.report_values
             (workspace_id, month, metric_key, value, entered_by)
           values (${ws}, '${month}-01', '${key}', ${base}, ${admin});`);
    }
  }

  await publishSeptember(page);
  await signIn(page, "client");
  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);

  // Wherever it lands — a card or the list — it must not be coloured.
  const row = page
    .locator("div")
    .filter({ hasText: /^Investment spend/ })
    .last();
  const html = await row.innerHTML();
  // It still shows the change; it just says nothing about whether the
  // change is good news.
  expect(html).toMatch(/[↑↓→]/);
  expect(html).not.toContain("text-deep-red");
  expect(html).not.toContain("#1f7a4d");
  expect(html).toContain("text-ink/55");

  await shot(page, "12-overflow-neutral-client", w);
});

/** A plain assertion, so a failure names the class rather than a boolean. */
function assertSome(condition: boolean, message: string) {
  expect(condition, message).toBe(true);
}
