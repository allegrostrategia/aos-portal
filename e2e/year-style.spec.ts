import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * The two year-grid styles, for Nina to choose between.
 *
 * Nina, 17 November: the grid "still looks like an old-fashioned
 * spreadsheet, and the green/red change figures aren't clear enough". Two
 * options on the Financials year view, at both widths, so she can compare
 * the same figures drawn two ways:
 *
 *   **A** — clean rows, no rules, a tinted pill under each figure.
 *   **B** — the same plus a soft heatmap tint on every cell.
 *
 * This spec exists to produce those four screenshots and to prove the
 * switch does what it says: that `?year=` cannot put either design on any
 * other page, and that an unrecognised value falls back to today's table
 * rather than to whichever option happens to be first.
 *
 * It goes when she picks one, with the switch and the losing option.
 */

requireLocalStack();

const TAB = "year-style";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

/**
 * Something in every month of the year, so the pills have changes to show.
 *
 * Revenue goes on the Actual grid and costs on the expense grid, which are
 * the two places Financials has read from since 13 November — a figure put
 * straight into `report_values` would be refused, because both are pulled.
 *
 * The shape is deliberate rather than a ramp: a dip in May gives a red pill
 * on revenue, and a fall in costs in August gives a GREEN one, which is the
 * case worth seeing on a screenshot — the colour is the metric's own good
 * direction and not the sign of the change.
 *
 * Conflict targets are the real constraints, named in full. `on conflict do
 * nothing` without one was refused outright, which is the better failure:
 * a guessed target that happened to match would have passed here and
 * silently stopped updating a row somebody re-ran it for.
 */
const REVENUE = [18400, 19200, 21050, 20400, 15900, 22300, 24850, 26100, 25400, 27900, 31200];
const COSTS = [9900, 10400, 11200, 11050, 11400, 11900, 12600, 10200, 12900, 13400, 14100];

async function aFullYear(workspaceId: string, sql: (q: string) => string) {
  sql(`insert into public.report_sales_rows (workspace_id, name, row_type, recurrence)
       values ('${workspaceId}', 'Retainer work', 'client', 'monthly')
       on conflict (workspace_id, name) do nothing;`);
  sql(`insert into public.report_expense_categories (workspace_id, name, bucket, is_default, sort_order)
       values ('${workspaceId}', 'Running costs', 'fixed', true, 90)
       on conflict (workspace_id, name) do nothing;`);

  for (const [i, amount] of REVENUE.entries()) {
    const month = `2026-${String(i + 1).padStart(2, "0")}-01`;
    sql(`insert into public.report_periods (workspace_id, month)
         values ('${workspaceId}', '${month}')
         on conflict (workspace_id, month) do nothing;`);
    sql(`insert into public.report_actuals (workspace_id, sales_row_id, month, amount, recurrence)
         select '${workspaceId}', id, '${month}', ${amount}, 'monthly'
           from public.report_sales_rows
          where workspace_id = '${workspaceId}' and name = 'Retainer work'
         on conflict (workspace_id, sales_row_id, month) do update set amount = excluded.amount;`);
    sql(`insert into public.report_expenses (workspace_id, category_id, month, amount, bucket)
         select '${workspaceId}', id, '${month}', ${COSTS[i]}, 'fixed'
           from public.report_expense_categories
          where workspace_id = '${workspaceId}' and name = 'Running costs'
         on conflict (workspace_id, category_id, month) do update set amount = excluded.amount;`);
  }
}

for (const option of ["a", "b"] as const) {
  test(`option ${option.toUpperCase()}: the Financials year view`, async ({ page }, info) => {
    const w = width(info.project.name);
    const { RETAINER, MONTHS, sql } = await import("../scripts/seed-test-db.mjs");
    const ws = sql(
      `select id from public.report_workspaces where business_name = '${RETAINER}'`,
    );
    await aFullYear(ws, sql);

    await signIn(page, "nina");
    await page.goto(
      `/reporting/financials?workspace=${ws}&month=${MONTHS.sep}&year=${option}`,
    );

    const card = page
      .locator("section")
      .filter({ hasText: "Your year — revenue, costs and profit" })
      .first();
    await expect(card).toBeVisible();

    // The pill is the thing Nina asked for, so it is the thing asserted:
    // a change, in a rounded element, not a bare caption.
    const pill = card.locator("span.rounded-full").filter({ hasText: "%" }).first();
    await expect(pill, "the change is a pill").toBeVisible();

    /**
     * **And the grid fits the card it is in.**
     *
     * Measured rather than looked at. The Year column is pinned, so a
     * table wider than its scroller does not merely scroll — the pinned
     * column paints itself over whatever is underneath, and what is
     * underneath is December's figure. It happened twice: once on the
     * gridded version, and again here the moment the months were widened
     * to hold a pill without checking what they had to fit inside.
     *
     * Desktop only. On a phone the grid is meant to scroll, and the
     * pinned column overlaying as you scroll is what pinning is for.
     */
    if (w === "desktop") {
      const fit = await card.evaluate((el) => {
        const table = el.querySelector("table") as HTMLTableElement;
        const scroller = table.parentElement as HTMLElement;
        const heads = [...table.querySelectorAll("thead th")] as HTMLElement[];
        return {
          overflow: table.scrollWidth - scroller.clientWidth,
          lastMonthRight: Math.round(heads[heads.length - 2].getBoundingClientRect().right),
          yearLeft: Math.round(heads[heads.length - 1].getBoundingClientRect().left),
        };
      });
      expect(fit.overflow, "the grid fits its card at desktop").toBeLessThanOrEqual(0);
      expect(
        fit.lastMonthRight,
        "the pinned Year column is not sitting on top of December",
      ).toBeLessThanOrEqual(fit.yearLeft);
    }

    await shoot(page, TAB, `year-${option}-financials`, w);
  });
}

test("the switch reaches Financials only, and an unknown value is today's table", async ({
  page,
}) => {
  const { RETAINER, MONTHS, sql } = await import("../scripts/seed-test-db.mjs");
  const ws = sql(`select id from public.report_workspaces where business_name = '${RETAINER}'`);
  // The same year of figures: without them the P&L card has no rows and
  // "no pills here" would pass against a card that was never drawn.
  await aFullYear(ws, sql);
  await signIn(page, "nina");

  // Another page, asked for option B: it must still be the gridded table,
  // because Nina has approved neither for the rest of the product yet.
  await page.goto(`/reporting/email?month=${MONTHS.sep}&year=b`);
  const elsewhere = page.locator("section").filter({ hasText: "Your year, month by month" }).first();
  if (await elsewhere.count()) {
    await expect(
      elsewhere.locator("span.rounded-full").filter({ hasText: "%" }),
      "no pills anywhere but Financials",
    ).toHaveCount(0);
  }

  // And a value that is neither option falls back rather than guessing.
  await page.goto(`/reporting/financials?month=${MONTHS.sep}&year=zzz`);
  const card = page
    .locator("section")
    .filter({ hasText: "Your year — revenue, costs and profit" })
    .first();
  await expect(card).toBeVisible();
  await expect(
    card.locator("span.rounded-full").filter({ hasText: "%" }),
    "an unrecognised ?year= is the table that was already there",
  ).toHaveCount(0);
});
