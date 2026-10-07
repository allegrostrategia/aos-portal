import { expect, test } from "@playwright/test";

import { MONTHS, PEOPLE } from "./guard.ts";
import {
  expectNothingAdminish,
  requireLocalStack,
  shoot,
  signIn,
  takeBackToDraft,
} from "./helpers.ts";

/**
 * Client Experience, clicked through as the real people.
 *
 * The four things Dom asked for: the opening figure's one-month rule
 * across four months, the stray figure and its red line, the client
 * seeing dashes while an earlier month is a draft, and the figures
 * matching once it is published.
 *
 * Against the local stack, as four fake accounts. The guard below refuses
 * anything else — these tests type figures and publish months, which
 * against a real project would mean doing it to somebody's report.
 */

requireLocalStack();

/**
 * A fresh database before every test.
 *
 * These tests type figures and publish months, so one leaves the next a
 * different world — and the desktop run would otherwise decide what the
 * phone run sees. Order-dependent fixtures have cost three rounds of
 * mutation testing this week; a couple of seconds a test is the cheaper
 * side of that trade.
 */
test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  // The opening figure is asked for on the workspace's first month, and the
  // seed publishes that month. Since 7 October a published month is
  // read-only, so these tests do what Nina would have to do: take it back
  // to draft first. The lock itself is `published-lock.spec.ts`.
  await takeBackToDraft(MONTHS.jul);
});

const TAB = "client-experience";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.describe("the opening figure", () => {
  test("is asked for on one month and no other", async ({ page }, info) => {
    const w = width(info.project.name);
    await signIn(page, "nina");

    // July is the workspace's first month, so that is where it is asked
    // for. The seed deliberately leaves it unset.
    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
    await expect(page.getByText(/start with the opening figure/i)).toBeVisible();
    await expect(page.getByLabel(/clients at the start/i)).toBeVisible();
    await shoot(page, TAB, "01-asked-on-first-month", w);

    // Every other month says where it lives, and offers no box.
    for (const month of [MONTHS.aug, MONTHS.sep]) {
      await page.goto(`/reporting/enter/client-experience?month=${month}`);
      await expect(page.getByText(/the opening figure goes on/i)).toBeVisible();
      await expect(page.getByLabel(/clients at the start/i)).toHaveCount(0);
    }
    await shoot(page, TAB, "02-not-asked-elsewhere", w);
  });

  test("once set, it carries forward and the figures work out", async ({ page }, info) => {
    const w = width(info.project.name);
    await signIn(page, "nina");

    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
    await page.getByLabel(/clients at the start/i).fill("10");
    await page.getByRole("button", { name: /^save/i }).first().click();
    await expect(page.getByText(/this is the opening figure/i)).toBeVisible();
    await shoot(page, TAB, "03-in-use", w);

    // September: 10, plus July's 3 in and 1 out, plus August's 5 in and 2
    // out, is 15 at the start of September.
    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
    await expect(page.getByText(/carried from earlier/i)).toBeVisible();
    await expect(page.getByText("15").first()).toBeVisible();
    await shoot(page, TAB, "04-carried", w);
  });

  test("a second one is marked not in use, in red", async ({ page }, info) => {
    const w = width(info.project.name);

    // **A stray cannot be made through the screens**, and that is worth
    // knowing: `saveWorkspaceSettings` refuses to move a client's first
    // month past figures that already exist, so the box never appears on
    // two months. The state is still reachable — a direct database write,
    // or an import — and the red line is what the screen owes somebody
    // who gets there. So it is seeded, not clicked.
    const { sql } = await import("../scripts/seed-test-db.mjs");
    sql(`
      insert into public.report_values
        (workspace_id, month, metric_key, value, entered_by)
      select w.id, '2026-09-01', 'client_experience_clients_at_start_opening', 500, m.id
        from public.report_workspaces w, public.members m
       where w.business_name = 'Northwind Studio' and m.role = 'admin'
       limit 1;
    `);

    await signIn(page, "nina");
    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
    await page.getByLabel(/clients at the start/i).fill("10");
    await page.getByRole("button", { name: /^save/i }).first().click();
    await expect(page.getByText(/this is the opening figure/i)).toBeVisible();

    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
    await expect(page.getByText(/it is not in use/i)).toBeVisible();
    await expect(page.getByText("500").first()).toBeVisible();
    await shoot(page, TAB, "05-stray-not-in-use", w);

    // The figure doing the work is still July's.
    await expect(page.getByText(/the opening figure is/i)).toContainText("10");
  });
});

test("the live card and the report agree on the same month", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByLabel(/clients at the start/i).fill("10");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/this is the opening figure/i)).toBeVisible();

  // The entry screen's "Worked out for you", which recomputes as you type
  // and so is a second implementation of the same arithmetic in all but
  // name. §9 says it and the report must never disagree; this is the only
  // test that can see it, because it lives in the browser.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.sep}`);
  const card = page.getByRole("complementary");
  const cardText = (await card.innerText()).replace(/\s+/g, " ");
  await shoot(page, TAB, "09-live-card", w);

  await page.goto(`/reporting/client-experience?month=${MONTHS.sep}`);
  const reportText = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  for (const label of [
    "Active clients at start",
    "New clients",
    "Active clients at end",
    "Retention rate",
    "Churn rate",
  ]) {
    const pattern = new RegExp(`${label}\\s+([0-9.,]+%?|—)`, "i");
    const inCard = cardText.match(pattern)?.[1];
    const inReport = reportText.match(pattern)?.[1];
    expect(inCard, `${label} is not on the entry card`).toBeTruthy();
    expect(inReport, `${label} is not on the report`).toBeTruthy();
    expect(inCard, `${label}: card ${inCard}, report ${inReport}`).toBe(inReport);
  }

  // Positive control: they are agreeing about real figures, not dashes.
  expect(cardText).toMatch(/New clients\s+4/);
  expect(cardText).toMatch(/Active clients at end\s+19/);
});

test.describe("what the client sees", () => {
  test("dashes while an earlier month is still a draft", async ({ page }, info) => {
    const w = width(info.project.name);
    await signIn(page, "client");

    // The seed publishes July and August and leaves September a draft.
    // September is not theirs to read at all.
    await page.goto(`/reporting/client-experience?month=${MONTHS.sep}`);
    await expect(page.getByText(/isn.t ready yet/i)).toBeVisible();
    await expectNothingAdminish(page);
    await shoot(page, TAB, "06-client-draft-month", w);
  });

  test("the figures match the admin's once it is published", async ({ page }, info) => {
    const w = width(info.project.name);

    // Nina sets the opening figure, so there is something to compare:
    // without it every Client Experience figure is honestly a dash, and a
    // comparison of two sets of dashes proves nothing.
    await signIn(page, "nina");
    await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
    await page.getByLabel(/clients at the start/i).fill("10");
    await page.getByRole("button", { name: /^save/i }).first().click();
    await expect(page.getByText(/this is the opening figure/i)).toBeVisible();

    // And publishes July again, because the beforeEach took it back to
    // draft to let her type. **This is not test housekeeping.** September's
    // "Active clients at start" is carried from July, and a client can only
    // read a published month — so with July a draft, the admin sees 15 here
    // and the client sees nothing. Unpublishing an early month to correct
    // it quietly empties the later months the client already has.
    await page.goto(`/reporting?month=${MONTHS.jul}`);
    await page.getByRole("button", { name: /publish this month/i }).click();
    await expect(page.getByText(/published/i).first()).toBeVisible();

    // Then publishes September.
    await page.goto(`/reporting?month=${MONTHS.sep}`);
    await page.getByRole("button", { name: /publish this month/i }).click();
    await expect(page.getByText(/published/i).first()).toBeVisible();

    await page.goto(`/reporting/client-experience?month=${MONTHS.sep}`);
    const adminText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    await shoot(page, TAB, "07-admin-report", w);

    // The same month, as the client.
    await signIn(page, "client");
    await page.goto(`/reporting/client-experience?month=${MONTHS.sep}`);
    await expect(page.getByText(/isn.t ready yet/i)).toHaveCount(0);
    const clientText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    await expectNothingAdminish(page);
    await shoot(page, TAB, "08-client-report", w);

    // Every figure the admin saw, the client sees. Compared on the
    // rendered numbers, because that is what each of them is looking at.
    for (const label of ["Active clients at start", "Retention rate", "Churn rate"]) {
      const figure = new RegExp(`${label}[^0-9—-]*([0-9.,]+%?|—)`, "i");
      const adminMatch = adminText.match(figure)?.[1];
      const clientMatch = clientText.match(figure)?.[1];
      expect(adminMatch, `${label} missing from the admin report`).toBeTruthy();
      expect(clientMatch, `${label}: admin ${adminMatch}, client ${clientMatch}`).toBe(adminMatch);
    }
  });

  test("the client's own name is theirs, and no other client exists", async ({ page }) => {
    await signIn(page, "client");
    await page.goto(`/reporting?month=${MONTHS.aug}`);

    await expect(page.getByText("Northwind Studio").first()).toBeVisible();
    await expect(page.getByText(PEOPLE.member.name)).toHaveCount(0);
    await expect(page.getByText("Ruth Test Coaching")).toHaveCount(0);
    await expect(page.locator('select, [role="combobox"]')).toHaveCount(0);
  });
});
