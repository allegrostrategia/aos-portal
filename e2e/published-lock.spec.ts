import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn, takeBackToDraft } from "./helpers.ts";

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

test("unpublishing warns about the months that read from this one", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // July is published and August is published after it, so taking July
  // back would empty part of an August report the client still has.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await expect(page.getByText(/august 2026 uses figures from this month/i)).toBeVisible();
  await expect(
    page.getByText(/republish august 2026 too, so it picks up the correction/i),
  ).toBeVisible();
  await shoot(page, TAB, "08-unpublish-warning", w);

  // The same warning where the button also lives, on the Overview.
  await page.goto(`/reporting?month=${MONTHS.jul}`);
  await expect(page.getByText(/august 2026 uses figures from this month/i)).toBeVisible();
  await shoot(page, TAB, "09-unpublish-warning-overview", w);

  // August is the last published month, so nothing reads from it and
  // there is nothing to warn about. A warning on every month would stop
  // being read by the second week.
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.aug}`);
  await expect(page.getByText(/has gone out/i)).toBeVisible();
  await expect(page.getByText(/uses figures from this month/i)).toHaveCount(0);
  await shoot(page, TAB, "10-no-warning-last-month", w);
});

test("what unpublishing really does to a later published month", async ({ page }, info) => {
  const w = width(info.project.name);

  // **The history of this test is the point of it.** Measured on 7 October,
  // the client's published August went from
  //
  //     start 22 · at end 25 · retention 90.9% · churn 9.1%
  //  to start —  · at end  3 · retention —     · churn —
  //
  // when July went back to draft. Three figures disappeared and one came
  // out WRONG: "start + new − left" computed happily from a start it could
  // not read, so a client reading mid-correction was told they ended
  // August with 3 clients.
  //
  // The strict `activeClientsAtEnd` fixed that, so this now asserts the
  // behaviour the warning describes: figures go MISSING, and none of them
  // lies. What is still unfixed is that they go missing at all — the
  // freeze-at-publish plan is for that, and until it ships the warning is
  // what stands between Nina and a surprised client.
  await signIn(page, "nina");
  await takeBackToDraft(MONTHS.jul);
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByLabel(/clients at the start/i).fill("20");
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect(page.getByText(/this is the opening figure/i)).toBeVisible();
  await page.goto(`/reporting?month=${MONTHS.jul}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  const readAugust = async () => {
    await page.goto(`/reporting/client-experience?month=${MONTHS.aug}`);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    return {
      text,
      end: text.match(/ACTIVE CLIENTS AT END\s*([0-9—.]+)/i)?.[1],
      start: text.match(/Active clients at start\s*([0-9—.]+)/i)?.[1],
    };
  };

  await signIn(page, "client");
  const before = await readAugust();
  expect(before.start).toBe("22");
  expect(before.end).toBe("25");
  expect(before.text).toMatch(/RETENTION RATE\s*[0-9]/);
  expect(before.text).toMatch(/CHURN RATE\s*[0-9]/);
  await shoot(page, TAB, "11-client-before-unpublish", w);

  await signIn(page, "nina");
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.jul}`);
  await page.getByRole("button", { name: /unpublish to make changes/i }).click();
  await expect(page.getByText(/has gone out/i)).toHaveCount(0);

  await signIn(page, "client");
  const after = await readAugust();
  expect(after.start, "the opening figure is gone from the client's view").toBeUndefined();
  // The one that used to read "3". A dash now, or no row at all — never a
  // number worked out from a figure the reader cannot see.
  expect(after.end === undefined || after.end === "—", `at end was "${after.end}"`).toBe(true);
  expect(after.text).not.toMatch(/ACTIVE CLIENTS AT END\s*[0-9]/);
  expect(after.text).not.toMatch(/RETENTION RATE\s*[0-9]/);
  expect(after.text).not.toMatch(/CHURN RATE\s*[0-9]/);
  await shoot(page, TAB, "12-client-after-unpublish", w);

  // It comes back. The damage is the window, not the data.
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.jul}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  await signIn(page, "client");
  const restored = await readAugust();
  expect(restored.end).toBe("25");
});

test("publishing out of order asks twice before it emails anybody", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // September is a draft with figures in it. Taking August back makes it
  // an earlier draft, so publishing September would freeze August's
  // unfinished figures into it — permanently, because the snapshot does
  // not change afterwards.
  await takeBackToDraft(MONTHS.aug);
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  await expect(
    page.getByText(/august 2026 is still a draft\. publish it first/i),
  ).toBeVisible();
  await expect(
    page.getByText(/september 2026 will be compared against unfinished figures/i),
  ).toBeVisible();
  await shoot(page, TAB, "13-out-of-order-warning", w);

  // The first click does not publish — it asks, and the SERVER is what
  // refuses. Dom's "let Nina continue if she chooses", where choosing is
  // an act rather than the absence of one, on a button that emails a
  // client. Enforced server-side because a confirm held in `useState` is
  // no confirm at all before hydration: the first click published the
  // month exactly that way while this was being written.
  await page.getByRole("button", { name: /^publish this month$/i }).click();
  const anyway = page.getByRole("button", { name: /publish anyway/i });
  await expect(anyway).toBeVisible();
  await expect(page.getByText(/^Published$/)).toHaveCount(0);
  await shoot(page, TAB, "14-publish-anyway", w);

  // The second click does.
  await anyway.click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();
});

test("a month whose predecessors are all out is published in one click", async ({ page }) => {
  // The common case by a long way. A confirm step on every publish would
  // be read past within a month, which is how a warning stops working.
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);

  await expect(page.getByText(/is still a draft/i)).toHaveCount(0);
  await page.getByRole("button", { name: /^publish this month$/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();
});
