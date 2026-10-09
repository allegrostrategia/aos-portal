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
