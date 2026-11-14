/**
 * The grids, the launches, the posts and the words.
 *
 * Split from the main script for length. Every statement is keyed to
 * the one demo workspace through the `w` sub-select it is handed.
 */
import { PLATFORMS, months } from "./data.mjs";
import {
  OFFERS, CLIENT_ROWS, EXPENSES, STAFF, HOOKS, B_ROLL, POST_TYPES,
  offerMonth, expenseMonth, launches, stagesFor, launchValues, launchEmailRates,
} from "./data2.mjs";
import { NOTES } from "./notes.mjs";

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replaceAll("'", "''")}'`);
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? "null" : String(v));

export function buildRest({ w, ent, row, adminId, MONTHS, currentMonth }) {
  const out = [];

  // --- the money grids ---------------------------------------------------
  // An offer's revenue is money received on the Financials rows linked to
  // it, so these rows are what makes the Offers page show anything at all.
  out.push(`insert into public.report_sales_rows (workspace_id, name, row_type, offer_entity_id, sort_order, recurrence)
    values ${[
      ...OFFERS.map((o, i) => `(${w}, ${q(o.name)}, 'offer', ${ent("offer", o.name)}, ${i}, ${o.model === "recurring" ? "'monthly'" : "'none'"})`),
      ...CLIENT_ROWS.map((c, i) => `(${w}, ${q(c.name)}, 'client', null, ${OFFERS.length + i}, 'monthly')`),
    ].join(",\n      ")};`);

  const actuals = [];
  const forecasts = [];
  MONTHS.forEach((month, i) => {
    for (const o of OFFERS) {
      const { revenue } = offerMonth(o, i, MONTHS.length);
      actuals.push(`(${w}, ${row(o.name)}, ${q(month)}, ${revenue}, ${o.model === "recurring" ? "'monthly'" : "'none'"})`);
    }
    for (const c of CLIENT_ROWS) {
      actuals.push(`(${w}, ${row(c.name)}, ${q(month)}, ${c.amount}, 'monthly')`);
    }
  });
  out.push(`insert into public.report_actuals (workspace_id, sales_row_id, month, amount, recurrence)
    values ${actuals.join(",\n      ")};`);

  // Four months ahead, so "still expected this year" has something in it.
  const ahead = months(currentMonth).slice(-1).concat(
    [1, 2, 3, 4].map((k) => {
      const [y, m] = currentMonth.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + k, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    }),
  );
  ahead.forEach((month, k) => {
    for (const o of OFFERS) {
      const { revenue } = offerMonth(o, MONTHS.length - 1, MONTHS.length);
      forecasts.push(`(${w}, ${row(o.name)}, ${q(month)}, ${Math.round(revenue * (1 + k * 0.04))})`);
    }
    for (const c of CLIENT_ROWS) forecasts.push(`(${w}, ${row(c.name)}, ${q(month)}, ${c.amount})`);
  });
  out.push(`insert into public.report_forecasts (workspace_id, sales_row_id, month, amount)
    values ${forecasts.join(",\n      ")};`);

  out.push(`insert into public.report_expense_categories (workspace_id, name, bucket, is_default, sort_order)
    values ${EXPENSES.map((e, i) => `(${w}, ${q(e.name)}, '${e.bucket}', true, ${i})`).join(",\n      ")};`);

  const cat = (name) => `(select id from public.report_expense_categories where workspace_id = ${w} and name = ${q(name)})`;
  const expenses = [];
  MONTHS.forEach((month, i) => {
    for (const e of EXPENSES) {
      expenses.push(`(${w}, ${cat(e.name)}, ${q(month)}, ${expenseMonth(e, i)}, '${e.bucket}')`);
    }
  });
  out.push(`insert into public.report_expenses (workspace_id, category_id, month, amount, bucket)
    values ${expenses.join(",\n      ")};`);

  out.push(`insert into public.report_staff (workspace_id, name, hourly_rate, sort_order)
    values ${STAFF.map((s, i) => `(${w}, ${q(s.name)}, ${s.rate}, ${i})`).join(",\n      ")};`);

  const staff = (name) => `(select id from public.report_staff where workspace_id = ${w} and name = ${q(name)})`;
  const hours = [];
  MONTHS.forEach((month, i) => {
    CLIENT_ROWS.forEach((c, ci) => {
      STAFF.forEach((s, si) => {
        const h = 4 + ((i + ci * 2 + si * 3) % 7) + (si === 0 ? 6 : 0);
        hours.push(`(${w}, ${row(c.name)}, ${staff(s.name)}, ${q(month)}, ${h}, ${s.rate})`);
      });
    });
  });
  out.push(`insert into public.report_client_hours (workspace_id, sales_row_id, staff_id, month, hours, rate_used)
    values ${hours.join(",\n      ")};`);

  // --- top posts and the trial-reel lists --------------------------------
  const posts = [];
  MONTHS.forEach((month, i) => {
    PLATFORMS.forEach((p, pi) => {
      for (let rank = 1; rank <= 3; rank += 1) {
        const reach = Math.round((28_000 - rank * 6_500) * (0.8 + i * 0.03) * (pi === 0 ? 1 : 0.45));
        posts.push(`(${w}, ${q(month)}, ${ent("social_platform", p.name)}, ${rank},
          ${q(`https://example.test/${p.name.toLowerCase()}/${month.slice(0, 7)}/${rank}`)},
          ${q(`${month.slice(0, 8)}${String(4 + rank * 6).padStart(2, "0")}`)},
          '${POST_TYPES[(i + rank) % POST_TYPES.length]}',
          ${reach}, ${Math.round(reach * 1.3)}, ${Math.round(reach * 0.06)},
          ${Math.round(reach * 0.018)}, ${Math.round(reach * 0.009)})`);
      }
    });
  });
  out.push(`insert into public.report_top_posts
      (workspace_id, month, entity_id, rank, url, posted_on, post_type, reach, views, likes_plus_comments, saves, shares)
    values ${posts.join(",\n      ")};`);

  const items = [];
  MONTHS.forEach((month, i) => {
    for (let rank = 1; rank <= 3; rank += 1) {
      items.push(`(${w}, ${q(month)}, 'hook', ${rank}, ${q(HOOKS[(i + rank) % HOOKS.length])}, ${Math.round(38_000 / rank + i * 900)})`);
      items.push(`(${w}, ${q(month)}, 'b_roll', ${rank}, ${q(B_ROLL[(i + rank) % B_ROLL.length])}, null)`);
    }
  });
  out.push(`insert into public.report_top_items (workspace_id, month, item_type, rank, body, views)
    values ${items.join(",\n      ")};`);

  // --- launches ----------------------------------------------------------
  const all = launches(currentMonth);
  out.push(`insert into public.report_launches
      (workspace_id, name, description, offer_entity_id, status, goal_good, goal_better, goal_best,
       planner_show_up_rate, planner_conversion_rate, published_at, published_by)
    values ${all.map((l) => `(${w}, ${q(l.name)}, ${q(l.description)}, ${ent("offer", l.offer)}, '${l.status}',
       ${l.goals[0]}, ${l.goals[1]}, ${l.goals[2]}, 47, 5.6,
       ${l.status === "completed" ? `${q(`${l.month} 10:00:00+00`)}, ${q(adminId)}` : "null, null"})`).join(",\n      ")};`);

  const lid = (name) => `(select id from public.report_launches where workspace_id = ${w} and name = ${q(name)})`;
  for (const l of all) {
    out.push(`insert into public.report_launch_stages
        (launch_id, position, stage_type, name, promo_start, promo_end, live_start, live_end, live_days, sign_up_goal, attendance_goal, is_main_selling_stage)
      values ${stagesFor(l).map((s) => `(${lid(l.name)}, ${s.position}, '${s.stage_type}', ${q(s.name)},
         ${q(s.promo_start ?? null)}, ${q(s.promo_end ?? null)}, ${q(s.live_start ?? null)}, ${q(s.live_end ?? null)},
         ${n(s.live_days)}, ${n(s.sign_up_goal)}, ${n(s.attendance_goal)}, ${s.is_main_selling_stage ? "true" : "false"})`).join(",\n        ")};`);

    out.push(`insert into public.report_launch_prices (launch_id, name, price, instalments, instalment_amount, is_main)
      values (${lid(l.name)}, ${q("Pay in full")}, ${l.name.startsWith("Mastermind") ? 6_000 : 1_850}, null, null, true),
             (${lid(l.name)}, ${q("3 instalments")}, ${l.name.startsWith("Mastermind") ? 6_600 : 1_980}, 3, ${l.name.startsWith("Mastermind") ? 2_200 : 660}, false);`);

    const lv = launchValues(l);
    const rows = Object.entries(lv).map(([key, value]) => `(${lid(l.name)}, ${q(key)}, ${n(value)}, ${q(adminId)})`);
    if (rows.length > 0) {
      out.push(`insert into public.report_launch_values (launch_id, metric_key, value, entered_by)
        values ${rows.join(",\n        ")};`);
    }
    const emails = launchEmailRates(l).map(
      (e) => `(${lid(l.name)}, 'launches_email_open_rate', ${e.email_number}, ${e.open_rate}, ${q(adminId)})`,
    );
    if (emails.length > 0) {
      out.push(`insert into public.report_launch_values (launch_id, metric_key, email_number, value, entered_by)
        values ${emails.join(",\n        ")};`);
    }
  }

  // --- targets, so the target lines have something to draw ---------------
  out.push(`insert into public.report_targets (workspace_id, metric_key, entity_id, target_value)
    values (${w}, 'social_media_followers_at_month_end', ${ent("social_platform", "Instagram")}, 28000),
           (${w}, 'offers_overall_margin', null, 45),
           (${w}, 'offers_overall_effective_hourly_rate', null, 200),
           (${w}, 'email_average_open_rate', null, 40),
           (${w}, 'leads_conversions_new_clients', null, 12);`);

  // --- the strategist's notes, on the last three months ------------------
  const notes = [];
  for (const month of MONTHS.slice(-3)) {
    for (const [category, body] of Object.entries(NOTES)) {
      notes.push(`(${w}, ${q(month)}, ${category === "overview" ? "null" : `'${category}'`}, 'strategist', ${q(adminId)}, ${q("Nina Oliver")}, ${q(body)})`);
    }
  }
  out.push(`insert into public.report_notes (workspace_id, month, category, note_type, author_id, author_name, body)
    values ${notes.join(",\n      ")};`);

  return out;
}
