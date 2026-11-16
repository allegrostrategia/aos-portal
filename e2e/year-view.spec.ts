import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * "Your year, month by month" — the grid Nina chose.
 *
 * She compared two restyles on the demo on 17 November and picked the one
 * with the wash: clean rows, a tinted pill under each figure, and every
 * cell washed green through red by the size of its change. The other and
 * the `?year=` switch that served them both are gone.
 *
 * **The figures here are a year of a real-shaped business**, because the
 * first screenshots were judged on a seed where Revenue from clients,
 * Total revenue and MRR were the same number every month and Fixed costs
 * was the whole of Total costs — four rows saying one thing, which tells
 * nobody whether the style works on a page of twelve different ones.
 */

requireLocalStack();

const TAB = "year-view";
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
/** A second client row, so Revenue from clients is not the whole of revenue. */
const SECOND = [4200, 4200, 4200, 5600, 5600, 5600, 5600, 7400, 7400, 7400, 9100];
/** A one-off each quarter: revenue that is NOT recurring, so MRR differs. */
const ONE_OFFS: Record<number, number> = { 2: 3500, 5: 2400, 8: 6800, 10: 4100 };
/** Four buckets, so Total costs is a sum of things rather than one thing. */
const COST_LINES: { name: string; bucket: string; amounts: number[] }[] = [
  { name: "Software", bucket: "fixed", amounts: [340, 340, 365, 365, 365, 410, 410, 410, 455, 455, 455] },
  { name: "Contractors", bucket: "variable", amounts: [1150, 1900, 2400, 1750, 2900, 3100, 3600, 1200, 3900, 4200, 4800] },
  { name: "Team salaries", bucket: "team", amounts: [6800, 6800, 6800, 7400, 7400, 7400, 7400, 7400, 7400, 8100, 8100] },
  { name: "Coaching", bucket: "investment", amounts: [500, 0, 0, 500, 0, 0, 1200, 0, 0, 500, 0] },
];

async function aFullYear(workspaceId: string, sql: (q: string) => string) {
  const rows = [
    { name: "Retainer work", recurrence: "monthly", amounts: REVENUE },
    { name: "Studio Verde", recurrence: "monthly", amounts: SECOND },
  ];

  for (const row of rows) {
    sql(`insert into public.report_sales_rows (workspace_id, name, row_type, recurrence)
         values ('${workspaceId}', '${row.name}', 'client', '${row.recurrence}')
         on conflict (workspace_id, name) do nothing;`);
  }
  sql(`insert into public.report_sales_rows (workspace_id, name, row_type, recurrence)
       values ('${workspaceId}', 'Project work', 'client', 'none')
       on conflict (workspace_id, name) do nothing;`);
  for (const line of COST_LINES) {
    sql(`insert into public.report_expense_categories (workspace_id, name, bucket, is_default, sort_order)
         values ('${workspaceId}', '${line.name}', '${line.bucket}', true, 90)
         on conflict (workspace_id, name) do nothing;`);
  }

  for (let i = 0; i < REVENUE.length; i += 1) {
    const month = `2026-${String(i + 1).padStart(2, "0")}-01`;
    sql(`insert into public.report_periods (workspace_id, month)
         values ('${workspaceId}', '${month}')
         on conflict (workspace_id, month) do nothing;`);

    for (const row of rows) {
      sql(`insert into public.report_actuals (workspace_id, sales_row_id, month, amount, recurrence)
           select '${workspaceId}', id, '${month}', ${row.amounts[i]}, '${row.recurrence}'
             from public.report_sales_rows
            where workspace_id = '${workspaceId}' and name = '${row.name}'
           on conflict (workspace_id, sales_row_id, month)
           do update set amount = excluded.amount, recurrence = excluded.recurrence;`);
    }
    if (ONE_OFFS[i]) {
      sql(`insert into public.report_actuals (workspace_id, sales_row_id, month, amount, recurrence)
           select '${workspaceId}', id, '${month}', ${ONE_OFFS[i]}, 'none'
             from public.report_sales_rows
            where workspace_id = '${workspaceId}' and name = 'Project work'
           on conflict (workspace_id, sales_row_id, month)
           do update set amount = excluded.amount;`);
    }
    for (const line of COST_LINES) {
      sql(`insert into public.report_expenses (workspace_id, category_id, month, amount, bucket)
           select '${workspaceId}', id, '${month}', ${line.amounts[i]}, '${line.bucket}'
             from public.report_expense_categories
            where workspace_id = '${workspaceId}' and name = '${line.name}'
           on conflict (workspace_id, category_id, month)
           do update set amount = excluded.amount;`);
    }
  }
}

test("the Financials year view", async ({ page }, info) => {
  const w = width(info.project.name);
  const { RETAINER, MONTHS, sql } = await import("../scripts/seed-test-db.mjs");
  const ws = sql(
    `select id from public.report_workspaces where business_name = '${RETAINER}'`,
  );
  await aFullYear(ws, sql);

  await signIn(page, "nina");
  await page.goto(`/reporting/financials?workspace=${ws}&month=${MONTHS.sep}`);

  const card = page
    .locator("section")
    .filter({ hasText: "Your year — revenue, costs and profit" })
    .first();
  await expect(card).toBeVisible();

  // The pill is the thing Nina asked for, so it is the thing asserted:
  // a change, in a rounded element, not a bare caption.
  const pill = card.locator("span.rounded-full").filter({ hasText: "%" }).first();
  await expect(pill, "the change is a pill").toBeVisible();

  // And the wash she chose it for. Read off the live DOM rather than the
  // class list, because the tint is an inline style scaled by the change.
  const washed = await card.evaluate(
    (el) =>
      [...el.querySelectorAll("td")].filter((td) => (td as HTMLElement).style.backgroundColor)
        .length,
  );
  expect(washed, "cells are tinted by their change").toBeGreaterThan(4);

  /**
   * **And the grid fits the card it is in.**
   *
   * Measured rather than looked at. The Year column is pinned, so a
   * table wider than its scroller does not merely scroll — the pinned
   * column paints itself over whatever is underneath, and what is
   * underneath is December's figure. It happened twice: once on the
   * gridded version, and again the moment the months were widened to
   * hold a pill without checking what they had to fit inside.
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

  await shoot(page, TAB, "01-financials-year", w);
});

test("every other page carries the same grid", async ({ page }, info) => {
  const w = width(info.project.name);
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  // Nina's choice is the product's now, not Financials'. Leads &
  // Conversions because half its year rows hang off an offer, which is
  // the one place they are built a different way — and because the seed
  // has figures there across two months, so there is a change to put in
  // a pill. (Social Media has no seeded figures at all, so its card
  // correctly draws nothing and proves nothing.)
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  const card = page.locator("section").filter({ hasText: "Your year, month by month" }).first();
  await expect(card).toBeVisible();
  await expect(
    card.locator("span.rounded-full").filter({ hasText: "%" }).first(),
    "pills here too",
  ).toBeVisible();

  await shoot(page, TAB, "03-leads-year", w);
});

