import { expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { localStack, PEOPLE } from "./guard.ts";

/** Every spec calls this first. No local stack, no browser tests. */
export function requireLocalStack() {
  return localStack();
}

export const SHOTS = "e2e/screenshots";

/**
 * Sign in as one of the fake people, through the real form.
 *
 * Not a cookie injected from the side: the sign-in path is itself a thing
 * that has been wrong twice this month — once sending every login to
 * /piazza, once honouring a `?next=` that was not theirs to use — so the
 * tests go through it.
 */
export async function signIn(page: Page, who: keyof typeof PEOPLE) {
  const person = PEOPLE[who];
  // Cookies first: switching role by clicking "Sign out" made these tests
  // depend on the sign-out UI, which has its own test and is not what a
  // figure-comparison test is about.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel(/email/i).fill(person.email);
  await page.getByLabel(/password/i).fill(person.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

export async function signOut(page: Page) {
  const link = page.getByRole("link", { name: /sign out/i });
  if (await link.count()) {
    await link.first().click();
    await page.waitForURL(/\/login/);
  }
}

/**
 * A screenshot, in a folder named for the tab, at whichever width this
 * project is running.
 *
 * Full page, because the thing a human eye is being asked to judge is
 * usually below the fold — a chart's legend, a card's empty state.
 */
export async function shoot(page: Page, tab: string, name: string, width: "desktop" | "phone") {
  const dir = `${SHOTS}/${tab}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
}

/**
 * The figure shown for a named metric on a report page.
 *
 * Reads the rendered text rather than the database, because the question
 * these tests answer is what the person is looking at.
 */
export async function reportFigure(page: Page, label: string): Promise<string | null> {
  const term = page.getByText(label, { exact: true }).first();
  if (!(await term.count())) return null;
  // The label and its value are siblings in a <div> on the KPI cards and
  // in a <dt>/<dd> pair in "Everything else this month".
  const value = term.locator("xpath=following-sibling::*[1]");
  return (await value.count()) ? ((await value.first().textContent())?.trim() ?? null) : null;
}

/** Fail loudly if a page carries anything only the team should see. */
export async function expectNothingAdminish(page: Page) {
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /enter data/i })).toHaveCount(0);
  await expect(page.getByText(/still to fill in/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /publish this month/i })).toHaveCount(0);
  await expect(page.getByText("DRAFT", { exact: true })).toHaveCount(0);
}

/**
 * Take a month back to draft so a test can type into it.
 *
 * From 7 October a published month is read-only — Dom's decision after the
 * finding that nothing held one still. The seed publishes July and August,
 * so a test about anything else that needs to enter a figure there has to
 * do what Nina would do first. Written as a step rather than worked around
 * by moving those tests to September, because where the opening figure is
 * asked for is the point of several of them: it lives on the workspace's
 * first month, and that month is published.
 *
 * Straight to the database rather than through the button: unpublishing is
 * covered by its own spec, and a test that needs a draft should say so in
 * one line rather than navigate somewhere else first.
 */
export async function takeBackToDraft(month: string, business = "Northwind Studio") {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`
    update public.report_periods p
       set published_at = null, published_by = null
      from public.report_workspaces w
     where w.id = p.workspace_id
       and w.business_name = '${business}'
       and p.month = '${month}-01';
  `);
}

/**
 * What a generic entry save leaves on the screen, **anchored to the start**.
 *
 * `getByText(/saved/i)` was in thirteen specs, and in almost all of them
 * it was a wait that passed before the click did anything. The save bar's
 * own idle text is "Nothing is saved until you press save." — it is on
 * the page from the first render, on every entry screen, and it matches.
 * So did "Saved as you leave each box." on Financials, "the months
 * already saved keep what they were saved with" on the Financials row
 * form, "Price will be captured when this month is saved" on Funnels,
 * and "Nothing is saved until you check" on every CSV card.
 *
 * The cost is not a false pass on a broken save — the next assertion
 * usually catches that. It is the **race**: the test walks on while the
 * action is still in flight, and a navigation cancels it. That failed
 * one run in two on 13 November and read as a product bug for an hour.
 *
 * Anchored, so nothing that merely contains the word can match: the
 * action says "Saved. <Category> is up to date for this month." when
 * something changed and "Nothing had changed." when nothing did, and
 * both are legitimate outcomes of pressing save. Where only one is
 * possible, the spec asserts that exact sentence instead of this.
 */
export const SAVE_CONFIRMED = /^(Saved\.|Nothing had changed\.)/;
