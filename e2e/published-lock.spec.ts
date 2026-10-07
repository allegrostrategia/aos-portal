import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * A published month is read-only, and there is one way through it.
 *
 * Dom's decision, 7 October 2026. The database half is tested in
 * `supabase/tests/published-months.test.mjs` as all three people; this is
 * the half only a browser can see — that nobody is invited to type into a
 * month that has gone out, and that the way to correct one is on the
 * screen where they wanted to type.
 *
 * The seed publishes July and August and leaves September a draft, so the
 * two states are a month apart and no test has to set one up.
 */

requireLocalStack();

const TAB = "published-lock";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

test("the entry screen for a published month says so, and offers the way out", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.aug}`);

  await expect(page.getByText(/has gone out/i)).toBeVisible();
  await expect(page.getByText(/the client has this report, so it is read-only/i)).toBeVisible();

  // Every control, not just the save button: the fieldset is what makes
  // that true, and a disabled input is the thing a person actually meets.
  const figure = page.locator("#v-financials_fixed_costs");
  await expect(figure).toBeDisabled();
  await expect(page.getByRole("button", { name: /^save/i })).toBeDisabled();

  // And the route out is here, not on another screen.
  await expect(page.getByRole("button", { name: /unpublish to make changes/i })).toBeEnabled();
  await shoot(page, TAB, "01-locked-admin", w);
});

test("a draft month is untouched by any of it", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);

  await expect(page.getByText(/has gone out/i)).toHaveCount(0);
  await expect(page.locator("#v-financials_fixed_costs")).toBeEnabled();
  await expect(page.getByRole("button", { name: /^save/i }).first()).toBeEnabled();
  await shoot(page, TAB, "02-draft-unchanged", w);
});

test("Elize is told whose it is, rather than given a button that would refuse her", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "elize");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.aug}`);

  await expect(page.getByText(/has gone out/i)).toBeVisible();
  await expect(page.getByText(/nina can take it back to draft for you/i)).toBeVisible();
  // Unpublishing is Nina's alone, so the button is not drawn for anyone else.
  await expect(page.getByRole("button", { name: /unpublish/i })).toHaveCount(0);
  await expect(page.locator("#v-financials_fixed_costs")).toBeDisabled();
  await shoot(page, TAB, "03-locked-editor", w);
});

test("the Overview's note and objectives are read-only too", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.aug}`);

  // §13 asks for removed, not hidden — so there is no textarea at all, and
  // the note reads as the client reads it.
  await expect(page.getByPlaceholder(/what happened this month/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save note/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save focus/i })).toHaveCount(0);
  await expect(page.getByText(/notes from your strategist/i)).toBeVisible();

  // September, a draft, still has both.
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await expect(page.getByRole("button", { name: /save note/i })).toBeVisible();
  await shoot(page, TAB, "04-overview-locked", w);
});

test("unpublish, fix, republish — the whole way round", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.aug}`);

  await page.getByRole("button", { name: /unpublish to make changes/i }).click();

  // The card goes, rather than reporting that it went: the month is no
  // longer locked, so the thing that only exists while it is locked
  // unmounts. That is the evidence — a working entry screen, on the spot,
  // with no reload and no second navigation.
  await expect(page.getByText(/has gone out/i)).toHaveCount(0);
  const figure = page.locator("#v-financials_fixed_costs");
  await expect(figure).toBeEnabled();
  await figure.fill("1234");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await shoot(page, TAB, "05-unpublished-and-editable", w);

  // Publishing again closes it. That the SECOND email is worded as an
  // update is asserted in `published-months.test.mjs`, where the send is
  // faked and `email_sent_at` can be read back — here it would depend on
  // an email provider the local stack does not have, which is a test of
  // the wrong thing.
  await page.goto(`/reporting?month=${MONTHS.aug}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();
  await shoot(page, TAB, "06-republished", w);

  // And shut again behind her.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.aug}`);
  await expect(page.getByText(/has gone out/i)).toBeVisible();
  await expect(page.locator("#v-financials_fixed_costs")).toBeDisabled();
});

test("the client can still reply to a published month", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "client");
  await page.goto(`/reporting?month=${MONTHS.aug}`);

  // The lock must not touch this. Publishing is what creates it.
  const box = page.getByPlaceholder(/anything you.d like to raise/i);
  await expect(box).toBeEnabled();
  await box.fill("Could you check the fixed costs for me?");
  await page.getByRole("button", { name: /send to your strategist/i }).click();
  await expect(page.getByText(/could you check the fixed costs/i)).toBeVisible();
  await shoot(page, TAB, "07-client-can-still-reply", w);
});
