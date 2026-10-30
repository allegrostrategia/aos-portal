import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { requireLocalStack } from "./helpers.ts";

/**
 * "Your profile is ready" — the card a member sees when their directory
 * listing is finished but their membership has not started yet.
 *
 * It exists because of the directory fix: the listing shows active members
 * only, so from the day that shipped a member in onboarding can finish the
 * profile form and still not appear. The older "you're not in the directory
 * yet" card does not fire for them — their listing IS complete — so without
 * this they read a directory they are not in, with nothing to say why.
 *
 * Written for Dom's look at both widths before it ships, and it asserts the
 * two things a photograph cannot: that the person really is absent from the
 * listing while the card is up, and that an active member with the same
 * finished profile does not get it.
 *
 * Its people are its own, created here and deleted afterwards. Nothing in the
 * shared seed is touched — the first draft moved Ruth's status back and forth
 * and would have handed every other spec a member in onboarding if it ever
 * died between the two.
 *
 * Run it on its own:
 *   npx playwright test directory-onboarding.spec.ts
 */

const stack = requireLocalStack();

const OUT = "docs/nina-review/screens-directory";
const PASSWORD = "test-password-directory";

/**
 * Three people with finished profiles. Only the status differs, which is the
 * whole experiment: same completed listing, two of them visible and one not.
 */
const CAST = {
  newcomer: {
    email: "newcomer@aos.test",
    name: "Hana Lindqvist",
    title: "Wedding florist",
    bio: "Flowers for weddings and events across the South West. Ten years in, first year with a team.",
    status: "onboarding",
  },
  alba: {
    email: "alba@aos.test",
    name: "Alba Moretti",
    title: "Brand photographer",
    bio: "Portraits and launch imagery for service businesses. Based in Leeds, travels for shoots.",
    status: "active",
  },
  priya: {
    email: "priya@aos.test",
    name: "Priya Raman",
    title: "Operations consultant",
    bio: "I build the back end of small agencies — onboarding, delivery, the handover nobody writes down.",
    status: "active",
  },
} as const;

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
}

/**
 * The entries grid, not the whole page.
 *
 * Unscoped text locators do not work here: the signed-in member's own name is
 * in the chrome, so `getByText(their name)` matches whether or not they are
 * listed — which is precisely the distinction these tests exist to make.
 */
function listing(page: Page) {
  return page.getByRole("main").locator("ul").first();
}

async function db(text: string) {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  return sql(text);
}

/** GoTrue's admin API, the same door `scripts/seed-test-db.mjs` uses. */
async function authAdmin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${stack.url}${path}`, {
    ...init,
    headers: {
      apikey: stack.serviceKey,
      Authorization: `Bearer ${stack.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function createLogin(email: string): Promise<string> {
  const page = await authAdmin("/auth/v1/admin/users?page=1&per_page=200");
  const existing = (page.users ?? page).find((u: { email: string }) => u.email === email);
  if (existing) {
    await authAdmin(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const created = await authAdmin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  return created.id;
}

/**
 * Sign in through the real form, like `helpers.signIn`, but for people this
 * spec made rather than the four in the shared seed.
 */
async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

const ids: Record<string, string> = {};
const esc = (s: string) => s.replace(/'/g, "''");

test.describe("a finished profile that nobody can see yet", () => {
  test.beforeAll(async () => {
    for (const [key, p] of Object.entries(CAST)) ids[key] = await createLogin(p.email);

    // Inserted at the status they need, never updated into it:
    // `protect_member_admin_fields()` refuses a status change to anyone
    // `is_portal_admin()` says no to, and a psql connection carries no JWT.
    const members = Object.entries(CAST)
      .map(
        ([k, p]) =>
          `('${ids[k]}'::uuid, '${p.email}', '${esc(p.name)}', 'member', '${p.status}')`,
      )
      .join(",");
    const profiles = Object.entries(CAST)
      .map(
        ([k, p]) =>
          `('${ids[k]}'::uuid, '${esc(p.name)}', '${esc(p.title)}', '${esc(p.bio)}', now())`,
      )
      .join(",");

    await db(`
      insert into public.members (id, email, full_name, role, status)
      values ${members}
      on conflict (id) do nothing;

      insert into public.member_profiles (member_id, display_name, title, bio, completed_at)
      values ${profiles}
      on conflict (member_id) do update
        set display_name = excluded.display_name,
            title        = excluded.title,
            bio          = excluded.bio,
            completed_at = excluded.completed_at;
    `);
  });

  test.afterAll(async () => {
    const list = Object.values(ids).map((id) => `'${id}'::uuid`).join(",");
    if (!list) return;
    await db(`
      delete from public.member_profiles where member_id in (${list});
      delete from public.members where id in (${list});
      delete from auth.users where id in (${list});
    `);
  });

  test("the card, and the listing they are not in", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";

    await signInAs(page, CAST.newcomer.email);
    await page.goto("/sociale/directory");
    await expect(page.getByRole("heading", { name: "Who else is here" })).toBeVisible();

    await expect(page.getByText("Your profile is ready")).toBeVisible();
    await expect(
      page.getByText(/Other members will see it once your membership starts/),
    ).toBeVisible();

    // The older card must NOT also be up. Both are lemon cards in the same
    // place, and the two of them stacked would read as a contradiction.
    await expect(page.getByText("You’re not in the directory yet")).toHaveCount(0);

    // The card tells the truth: the other two are listed and she is not.
    // Note what that means on this screen — a listed member's own card is
    // marked "· you", so she is looking at a directory in which everybody is
    // present except her, with nothing marked as hers.
    await expect(listing(page).getByText(CAST.alba.name)).toBeVisible();
    await expect(listing(page).getByText(CAST.priya.name)).toBeVisible();
    await expect(listing(page).getByText(CAST.newcomer.name)).toHaveCount(0);
    await expect(listing(page).getByText("· you")).toHaveCount(0);

    // The sentence under the search box, whole. It read "Your profile . Add"
    // until 30 October — a `{" "}` before a string that already began with the
    // full stop. Asserted because the gap is one character and invisible in a
    // diff, and it is on the screen every member reads.
    await expect(
      page.getByText("Your profile. Add a photo, change your bio, or update your links."),
    ).toBeVisible();

    await shot(page, "01-profile-ready", w);
  });

  test("an active member with the same finished profile gets no card", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";

    await signInAs(page, CAST.alba.email);
    await page.goto("/sociale/directory");
    await expect(page.getByRole("heading", { name: "Who else is here" })).toBeVisible();

    await expect(page.getByText("Your profile is ready")).toHaveCount(0);
    await expect(page.getByText("You’re not in the directory yet")).toHaveCount(0);

    // She is in it, marked as hers, and the newcomer still is not — the same
    // listing read by a second pair of eyes.
    await expect(listing(page).getByText(`${CAST.alba.name} · you`)).toBeVisible();
    await expect(listing(page).getByText(CAST.newcomer.name)).toHaveCount(0);

    await shot(page, "02-active-no-card", w);
  });
});
