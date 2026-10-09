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

test("first login to a finished month, without help", async ({ page }, info) => {
  // The brief's own definition of Stage 5 being done (§11.5): *"a test
  // member can go from first login to a finished month without help."*
  // It was written first and left `fixme` while the pieces landed.
  const w = width(info.project.name);
  const { MONTHS, PEOPLE, sql } = await import("../scripts/seed-test-db.mjs");

  // A member who has genuinely never been through setup: the seed's
  // workspace is already named, so this puts it back to how
  // `ensure_member_report_workspace` leaves one.
  const uid = sql(`select id from auth.users where email = '${PEOPLE.member.email}'`);
  sql(`update public.report_workspaces
          set benchmark_business_description = null, hidden_categories = '{}'
        where owner_user_id = '${uid}';`);

  await signIn(page, "member");

  // 1. She finds it from her own navigation, not by knowing the URL.
  await page.goto("/you");
  await page.getByRole("link", { name: /your monthly report/i }).click();
  await page.waitForURL(/\/reporting/);
  await shoot(page, TAB, "01-arrives", w);

  // 2. It asks her to set it up, once.
  await expect(page.getByRole("heading", { name: /set your report up/i })).toBeVisible();
  await page.getByRole("link", { name: /set your report up/i }).click();
  await page.waitForURL(/\/settings/);

  await page.getByLabel(/what the business is called/i).fill("Ruth Fairweather Coaching");
  await page.getByLabel(/what the business does/i).fill("One-to-one coaching for founders");
  await page.getByLabel(/^main offers$/i).fill("Six-month container");
  await page.getByLabel(/^country$/i).fill("United Kingdom");
  await page.getByLabel(/target hourly rate/i).fill("150");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await expect(page.locator("[data-saved]")).toHaveText("Saved.");

  // 3. She turns off what she does not use.
  for (const section of ["Ads", "Funnels", "Trial Reels", "Social Media", "Email", "Offers"]) {
    await page.getByRole("checkbox", { name: section, exact: true }).uncheck();
  }
  await page.getByRole("button", { name: /save the sections/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Sections saved.");

  // 4. She fills in what is left. Two sections, and the opening figure
  //    she is only ever asked once.
  await page.goto(`/reporting/enter/leads-conversions?month=${MONTHS.sep}`);
  for (const [label, value] of [
    [/new leads from social/i, "20"], [/new leads from email/i, "8"],
    [/new leads from referral/i, "2"], [/calls booked/i, "6"],
    [/calls held/i, "5"], [/new clients/i, "3"],
  ] as const) {
    await page.getByLabel(label).first().fill(value);
  }
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  // The opening figure is asked once, on the month it applies to —
  // their first. The screen says so ("The opening figure goes on July
  // 2026"), and following it is the flow a member actually has.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByLabel(/when you joined/i).first().fill("12");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
  for (const [label, value] of [
    [/clients who left/i, "1"], [/renewals and upsells/i, "2"],
    [/issues raised/i, "0"],
  ] as const) {
    await page.getByLabel(label).first().fill(value);
  }
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  for (const [label, value] of [
    [/fixed costs/i, "300"], [/variable costs/i, "250"],
    [/team costs/i, "500"], [/cash in bank/i, "9000"],
  ] as const) {
    await page.getByLabel(label).first().fill(value);
  }
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  // 5. Her reflection, and next month's objectives.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("textbox", { name: /your reflection on/i })
    .fill("Fewer calls than I wanted, but the ones I had converted.");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await expect(page.getByText(/^Saved\.$/).first()).toBeVisible();

  // 6. The month reads as done — every visible section, and the setup
  //    prompt is gone because she has been through it.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.getByRole("heading", { name: /set your report up/i })).toHaveCount(0);
  const rows = page.locator("[data-completion]");
  const total = await rows.count();
  expect(total, "three sections left on").toBe(3);
  for (let i = 0; i < total; i += 1) {
    const row = rows.nth(i);
    expect(
      await row.getAttribute("data-filled"),
      `${await row.getAttribute("data-completion")} is finished`,
    ).toBe(await row.getAttribute("data-total"));
  }
  await shoot(page, TAB, "08-finished-month", w);

  // And Piazza stops asking, because there is nothing left to ask for.
  await page.goto("/piazza");
  const piazza = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(piazza, "the nudge goes when the month is done")
    .not.toMatch(/it is not finished yet/i);
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

test("Piazza says last month is unfinished, and says it to nobody else", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "member");
  await page.goto("/piazza");

  // §8.1's nudge, where the six-item navigation deliberately has no
  // seventh entry for a once-a-month job.
  await expect(page.getByRole("heading", { name: /your .* report/i })).toBeVisible();
  await shoot(page, TAB, "05-piazza-card", w);

  await page.getByRole("link", { name: /fill it in/i }).click();
  await page.waitForURL(/\/reporting/);

  // **Private by construction** (Dom, 9 October): it is derived from
  // this member's own workspace on their own page render, so there is
  // nothing for anybody else to see. Nina, who has no member workspace
  // and is not reporting on herself, gets no card about one.
  await signIn(page, "nina");
  await page.goto("/piazza");
  const nina = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(nina, "nobody else is told about it").not.toMatch(/report.{0,20}not finished yet/i);
});

test("a Chiarezza attendee whose access has ended is told that, not that something is broken", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { PEOPLE, sql } = await import("../scripts/seed-test-db.mjs");

  // Turn the member's own workspace into a Chiarezza one that finished
  // last month. It is the same shape — self-serve with an end date —
  // and it is the state nobody had ever walked through.
  const uid = sql(`select id from auth.users where email = '${PEOPLE.member.email}'`);
  sql(`update public.report_workspaces
          set kind = 'chiarezza', access_end_date = (current_date - 30)
        where owner_user_id = '${uid}';`);
  // They are an attendee, not a member: no members row, which is the
  // reason the page had nothing to say about them.
  sql(`delete from public.members where id = '${uid}';`);

  await signIn(page, "member");
  await page.goto("/reporting");
  await page.waitForURL(/\/no-access/);

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body, "their access ended").toMatch(/your access has ended/i);
  expect(body, "not an account still being set up").not.toMatch(/isn.t ready yet/i);
  expect(body, "and nothing has been deleted").toMatch(/nothing has been deleted/i);
  await shoot(page, TAB, "06-access-ended", w);

  // **And somebody who ALSO holds a grant that has not ended is not
  // told their access ran out.** Attending Chiarezza and then joining
  // aOS is the obvious way to hold both, and "your access has ended"
  // would be the wrong half of the truth.
  const other = sql(`select id from public.report_workspaces
                      where owner_user_id <> '${uid}' limit 1`);
  sql(`insert into public.report_access (workspace_id, user_id, role, display_name)
       values ('${other}', '${uid}', 'client', 'Ruth Test')
       on conflict (workspace_id, user_id) do nothing;`);

  await page.goto("/no-access");
  const both = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(both, "one open grant is enough").not.toMatch(/your access has ended/i);
});

test("Nina sees where each member is, and what they have turned off", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  const { PEOPLE, SELF_SERVE, sql } = await import("../scripts/seed-test-db.mjs");
  const uid = sql(`select id from auth.users where email = '${PEOPLE.member.email}'`);
  const ws = sql(`select id from public.report_workspaces where owner_user_id = '${uid}'`);
  sql(`update public.report_workspaces
          set hidden_categories = array['ads','funnels']::report_category[]
        where id = '${ws}';`);

  await signIn(page, "nina");
  await page.goto("/admin/reporting");

  const status = page.locator(`[data-member-status="${ws}"]`);
  await expect(status).toContainText(/not finished yet/i);
  await expect(status, "and what they have turned off").toContainText(/Ads/);
  await expect(status).toContainText(/Funnels/);
  await shoot(page, TAB, "07-admin-status", w);

  // **Read-only.** §8.1 gives her the list so she can raise it, not so
  // she can fill it in — a member enters everything themselves.
  const card = page.locator("section", { hasText: SELF_SERVE });
  await expect(card.getByRole("link", { name: /enter|fill/i })).toHaveCount(0);

  // A retainer client has no such line: Allegro fills theirs in, so
  // "not finished yet" would be about Nina, not about them.
  const retainerCard = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(retainerCard.match(/not finished yet/gi)?.length ?? 0).toBe(1);
});

test("a month counts as done when one of its sections has nothing to fill in", async ({
  page,
}) => {
  // Offers is row-backed, and a member with no offers owes it nothing.
  // The count above the list has to treat that as finished rather than
  // skip it — counted the other way, the denominator still includes it
  // and "2 of 2" is never reached however much is typed.
  const { MONTHS, PEOPLE, sql } = await import("../scripts/seed-test-db.mjs");
  const uid = sql(`select id from auth.users where email = '${PEOPLE.member.email}'`);
  sql(`delete from public.report_entities
        where workspace_id = (select id from public.report_workspaces where owner_user_id = '${uid}');`);

  await signIn(page, "member");
  await page.goto("/reporting/settings");
  for (const section of ["Social Media", "Trial Reels", "Email", "Funnels",
    "Leads & Conversions", "Ads", "Client Experience"]) {
    await page.getByRole("checkbox", { name: section, exact: true }).uncheck();
  }
  await page.getByRole("button", { name: /save the sections/i }).click();
  await expect(page.locator("[data-saved]")).toHaveText("Sections saved.");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  for (const [label, value] of [
    [/fixed costs/i, "300"], [/variable costs/i, "250"],
    [/team costs/i, "500"], [/cash in bank/i, "9000"],
  ] as const) {
    await page.getByLabel(label).first().fill(value);
  }
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|nothing to save/i).first()).toBeVisible();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.locator("[data-completion='offers']")).toHaveAttribute("data-total", "0");
  await expect(page.getByText(/2 of 2 done/i)).toBeVisible();
});
