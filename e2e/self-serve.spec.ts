import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Stage 5 — an aOS member reporting on themselves.
 *
 * The brief's own definition of finished (§11.5): *"a test member can go
 * from first login to a finished month without help."* That sentence is
 * the specification, so it is the first test, and the stage is done when
 * it passes end to end.
 *
 * Everything here runs as Ruth, who is an `aos_member` workspace: she
 * enters her own figures, Financials included, and nobody at Allegro
 * enters anything for her.
 */

requireLocalStack();

const TAB = "self-serve";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("none of the parts that assume somebody at Allegro is on the other side", async ({
  page,
}) => {
  // Dom, 9 October. A member's report has no other side: no strategist
  // writing a note, nobody to publish it to them, nobody to reply to,
  // and no month that "isn't ready yet" — they are the person who would
  // be getting it ready.
  await signIn(page, "member");
  await page.goto("/reporting");

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body, "no strategist note").not.toMatch(/strategist/i);
  expect(body, "nothing to publish").not.toMatch(/publish/i);
  expect(body, "nobody to reply to").not.toMatch(/reply/i);
  expect(body, "no month withheld from them").not.toMatch(/isn.t ready yet/i);
  // And nothing calls them "this client", which is Allegro's word for
  // somebody else.
  expect(body, "not spoken about in the third person").not.toMatch(/this client/i);
});

test("a section she has no rows in is done, not orange forever", async ({ page }) => {
  // A member with no offers has nothing to fill in, so Offers is
  // finished. It read 0 of 3 — permanently unfinished for a section
  // that was never going to have anything in it (Dom, 9 October).
  await signIn(page, "member");
  await page.goto("/reporting");

  const offers = page.locator("[data-completion='offers']");
  await expect(offers).toHaveAttribute("data-total", "0");
});

test("the figure she is only ever asked once does not hold a month open", async ({ page }) => {
  // "Clients at the start, when you joined" is answered one time and
  // carried forward — `computeCarried` reads it across every month up
  // to this one. Counted monthly it would keep Client Experience orange
  // for ever, which is the one thing a completion marker must not do.
  //
  // So it is answered in JULY and the month checked is SEPTEMBER. Doing
  // both in one month would pass whether it was carried or not.
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "member");

  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByLabel(/when you joined/i).fill("40");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
  await page.getByLabel(/clients who left/i).fill("1");
  await page.getByLabel(/renewals and upsells/i).fill("2");
  await page.getByLabel(/issues raised/i).fill("0");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const ce = page.locator("[data-completion='client_experience']");
  await expect(ce).toHaveAttribute("data-total", "4");
  await expect(ce, "the July answer still counts in September").toHaveAttribute("data-filled", "4");
});

/**
 * **The target for the rest of Stage 5, and deliberately not passing
 * yet.** `fixme` rather than left red, so the suite stays honest about
 * what works; the marker comes off a step at a time as each piece lands.
 *
 * Still to build for it:
 *   · first-time setup (business, offers, first targets)
 *   · hiding a category
 *   · her reflection and next month's objectives
 *   · the month reading as done
 *
 * Already in: the way in from You, and the completion markers it reads.
 */
test.fixme("first login to a finished month, without help", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "member");

  // 1. She finds it from her own navigation, not by knowing the URL.
  await page.goto("/you");
  await page.getByRole("link", { name: /report/i }).first().click();
  await page.waitForURL(/\/reporting/);
  await shoot(page, TAB, "01-arrives", w);

  // 2. First-time setup asks what it needs, once.
  await expect(page.getByText(/set .*(up|your report)/i).first()).toBeVisible();

  // 3. She hides what she does not use, and it goes.
  // 4. She fills in what she does, and the markers go green.
  // 5. She writes her reflection and next month's objectives.
  // 6. The month reads as done.
});

test("Nina's client list is three lists, not one", async ({ page }, info) => {
  // Dom, 9 October. Once a member's workspace is created with the
  // member, this page stops being the handful Nina set up by hand and
  // becomes every member as well.
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto("/admin/reporting");

  await expect(page.getByText(/retainer clients · 1/i)).toBeVisible();
  await expect(page.getByText(/aOS members · 1/i)).toBeVisible();
  // Nothing invents a section for a kind nobody is.
  await expect(page.getByText(/chiarezza ·/i)).toHaveCount(0);

  // And each business sits under its own heading, in that order.
  //
  // **Lowercased**, because the headings are uppercased in CSS and
  // `innerText` gives back what is rendered. Comparing against the
  // written casing found nothing, and `indexOf` returning -1 made the
  // first of these pass for the wrong reason — -1 is less than any real
  // position, so a missing heading reads as "it came first".
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").toLowerCase();
  const at = (text: string) => {
    const index = body.indexOf(text.toLowerCase());
    expect(index, `"${text}" should be on the page`).toBeGreaterThan(-1);
    return index;
  };
  expect(at("Retainer clients")).toBeLessThan(at("Northwind Studio"));
  expect(at("Northwind Studio")).toBeLessThan(at("aOS members"));
  expect(at("aOS members")).toBeLessThan(at("Ruth Test Coaching"));

  await shoot(page, TAB, "02-admin-split", w);
});

test("hiding a section takes it off, and nothing is lost", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "member");

  // Something to lose: a figure in the section about to be hidden.
  await page.goto(`/reporting/enter/email?month=${MONTHS.sep}`);
  await page.getByLabel(/list size at month end/i).fill("900");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("link", { name: /your report settings/i }).click();
  await page.waitForURL(/\/settings/);
  await shoot(page, TAB, "03-settings", w);

  await page.getByRole("checkbox", { name: "Email", exact: true }).uncheck();
  await page.getByRole("button", { name: /save the sections/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Sections saved.");

  // Off the tab row, off the list of what is still to fill in.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.locator("[data-completion='email']")).toHaveCount(0);
  await expect(page.locator("[data-tabs]").getByRole("link", { name: "Email", exact: true }))
    .toHaveCount(0);

  // **Display only.** Turning it back on brings the figure with it —
  // nothing was deleted (Dom, 9 October).
  await page.goto("/reporting/settings");
  await page.getByRole("checkbox", { name: "Email", exact: true }).check();
  await page.getByRole("button", { name: /save the sections/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Sections saved.");

  await page.goto(`/reporting/enter/email?month=${MONTHS.sep}`);
  await expect(page.getByLabel(/list size at month end/i)).toHaveValue("900");
});

test("a figure pulled into another section survives its own being hidden", async ({ page }) => {
  // `PULLED_FROM` carries Offers' revenue into Financials, so Financials
  // shows a figure whose source is a section that can be turned off.
  // Hiding Offers must not blank it (Dom, 9 October).
  //
  // The offer is seeded rather than clicked through: the subject here is
  // the pull, and driving the Offers screen would be testing that
  // instead.
  const { MONTHS, SELF_SERVE, sql } = await import("../scripts/seed-test-db.mjs");
  const ws = sql(`select id from public.report_workspaces where business_name = '${SELF_SERVE}'`);
  sql(`insert into public.report_entities (workspace_id, entity_type, name)
       values ('${ws}', 'offer', 'Coaching');`);
  const offer = sql(`select id from public.report_entities
                      where workspace_id = '${ws}' and name = 'Coaching'`);
  sql(`insert into public.report_values (workspace_id, month, metric_key, entity_id, value, entered_by)
       select '${ws}', '${MONTHS.sep}', 'offers_revenue_this_month', '${offer}', 4000,
              (select id from public.members where role = 'admin' limit 1);`);

  await signIn(page, "member");
  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  const before = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(before, "Financials reads it through the pull to begin with").toMatch(/4,000|4000/);

  await page.goto("/reporting/settings");
  await page.getByRole("checkbox", { name: "Offers", exact: true }).uncheck();
  await page.getByRole("button", { name: /save the sections/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Sections saved.");

  // Offers is gone from the tabs, and Financials still has the figure.
  await expect(page.locator("[data-tabs]").getByRole("link", { name: "Offers", exact: true }))
    .toHaveCount(0);
  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(after, "and still does with Offers hidden").toMatch(/4,000|4000/);
});

test("her reflection and her objectives, where a client reads Nina's note", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "member");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  await expect(page.getByRole("heading", { name: /your reflection/i })).toBeVisible();
  await page.getByRole("textbox", { name: /your reflection on/i })
    .fill("Quiet month. The challenge took more time than it earned.");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await expect(page.getByText(/^Saved\.$/).first()).toBeVisible();

  // It is still there when the page comes back, and editing replaces it
  // rather than adding a second.
  await page.reload();
  await expect(page.getByRole("textbox", { name: /your reflection on/i }))
    .toHaveValue(/took more time than it earned/);
  await shoot(page, TAB, "04-reflection", w);

  // Objectives are hers too — and worded as hers. The card told a
  // retainer client's story: "the client sees them once this month is
  // published", which is two things a member does not have.
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body).toMatch(/What you.{0,3}re focusing on next month/i);
  expect(body, "not spoken about in the third person").not.toMatch(/the client sees them/i);
  expect(body, "and nothing about publishing").not.toMatch(/once this month is published/i);
});

test("a retainer client gets the reply box, not a reflection", async ({ page }) => {
  // The one thing that stays Allegro's side of the line: a reply is a
  // conversation with Nina, a reflection is a note to yourself.
  await signIn(page, "client");
  await page.goto("/reporting");

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body, "no reflection box").not.toMatch(/your reflection/i);
  expect(body, "their strategist's note is still theirs").toMatch(/strategist/i);
});
