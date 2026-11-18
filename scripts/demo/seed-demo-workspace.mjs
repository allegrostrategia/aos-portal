/**
 * "Demo – Lemon Studio": a full, believable year for Nina to look at.
 *
 *   node scripts/demo/seed-demo-workspace.mjs --target=local
 *   node scripts/demo/seed-demo-workspace.mjs --target=live
 *
 * **Why this writes SQL rather than calling the app's own actions.**
 * Creating a workspace goes through `create_report_workspace`, which
 * asks `is_portal_admin()` — and the service role has no JWT, so it is
 * refused (the rule in CLAUDE.md about guard triggers, in its other
 * form). The alternative is signing in as a real admin against live,
 * which is the one thing this project never does. So the two inserts
 * that function would have made are made here, in the same order.
 *
 * Re-running replaces the demo workspace and nothing else: every delete
 * below is keyed to this one business name. It is a fixture, not a
 * client — but it lives on the live database, so the teardown is
 * explicit and narrow rather than a cascade nobody has read.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLATFORMS, FUNNELS, CAMPAIGNS,
  months, platformMonth, trialReelsMonth, emailMonth, funnelMonth, campaignMonth,
  leadsMonth, clientExperienceMonth,
} from "./data.mjs";
import { OFFERS, bespokeWins, callWins, offerMonth } from "./data2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUSINESS = "Demo – Lemon Studio";
const DEMO_EMAIL = "demo.client@allegrostrategia.com";
const CURRENT_MONTH = "2026-11";

const target = (process.argv.find((a) => a.startsWith("--target=")) ?? "").split("=")[1];
if (!["local", "live"].includes(target)) {
  console.error("usage: seed-demo-workspace.mjs --target=local|live");
  process.exit(1);
}

// ---------------------------------------------------------------- plumbing

async function env() {
  const text = await readFile(path.join(ROOT, ".env.local"), "utf8");
  const read = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  return { url: read("NEXT_PUBLIC_SUPABASE_URL"), serviceKey: read("SUPABASE_SERVICE_ROLE_KEY") };
}

const LOCAL = { url: "http://127.0.0.1:54321" };

async function authAdmin(config, pathname, init = {}) {
  const res = await fetch(`${config.url}${pathname}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} → ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
}

/** The demo client's login, created if it is not already there. */
/**
 * The demo client's login.
 *
 * **An existing password is left alone unless one was given** (16
 * November). Re-running this to update the figures used to reset it, so
 * the password Nina had been handed stopped working and nothing said so
 * — a seeding script quietly invalidating a credential somebody is
 * holding. Pass `DEMO_PASSWORD` to set it deliberately; otherwise a
 * reseed touches the data and not the way in.
 */
async function demoUser(config, password, { resetPassword = false } = {}) {
  const page = await authAdmin(config, "/auth/v1/admin/users?page=1&per_page=1000");
  const existing = (page.users ?? page).find((u) => u.email === DEMO_EMAIL);
  if (existing) {
    if (resetPassword) {
      await authAdmin(config, `/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify({ password, email_confirm: true }),
      });
    }
    return { id: existing.id, created: false, passwordChanged: resetPassword };
  }
  const made = await authAdmin(config, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: DEMO_EMAIL, password, email_confirm: true }),
  });
  return { id: made.id, created: true, passwordChanged: true };
}

async function runSql(sql) {
  if (target === "local") {
    const { execFileSync } = await import("node:child_process");
    return execFileSync("docker", ["exec", "-i", "supabase_db_aos-portal", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], {
      input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    }).trim();
  }
  const { readAccessToken } = await import(path.join(ROOT, "scripts/supabase-token.mjs"));
  const token = await readAccessToken();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/kawlebzqfgcdlvewqqgh/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 1500)}`);
  return JSON.parse(text);
}

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replaceAll("'", "''")}'`);
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? "null" : String(v));

// ---------------------------------------------------------------- the year

const MONTHS = months(CURRENT_MONTH);
const PAST = MONTHS.slice(0, -1);
const NOW = MONTHS.at(-1);

function buildSql(userId, adminId) {
  const out = [];
  const w = `(select id from public.report_workspaces where business_name = ${q(BUSINESS)})`;
  const ent = (type, name) =>
    `(select id from public.report_entities where workspace_id = ${w} and entity_type = '${type}' and name = ${q(name)})`;
  const row = (name) =>
    `(select id from public.report_sales_rows where workspace_id = ${w} and name = ${q(name)})`;

  // --- teardown, narrow and in dependency order -------------------------
  // `on delete restrict` sits between the grids and their rows, so a
  // plain cascade from the workspace is refused. Each line names this
  // workspace; nothing here can reach another client's data.
  out.push(`
    delete from public.report_client_hours where workspace_id = ${w};
    delete from public.report_actuals where workspace_id = ${w};
    delete from public.report_forecasts where workspace_id = ${w};
    delete from public.report_sales_rows where workspace_id = ${w};
    delete from public.report_expenses where workspace_id = ${w};
    delete from public.report_expense_categories where workspace_id = ${w};
    delete from public.report_staff where workspace_id = ${w};
    delete from public.report_top_posts where workspace_id = ${w};
    delete from public.report_top_items where workspace_id = ${w};
    delete from public.report_launch_values where launch_id in (select id from public.report_launches where workspace_id = ${w});
    delete from public.report_launch_stages where launch_id in (select id from public.report_launches where workspace_id = ${w});
    delete from public.report_launch_prices where launch_id in (select id from public.report_launches where workspace_id = ${w});
    delete from public.report_launches where workspace_id = ${w};
    delete from public.report_values where workspace_id = ${w};
    delete from public.report_targets where workspace_id = ${w};
    delete from public.report_notes where workspace_id = ${w};
    delete from public.report_periods where workspace_id = ${w};
    delete from public.report_entities where workspace_id = ${w};
    delete from public.report_access where workspace_id = ${w};
    delete from public.report_workspaces where business_name = ${q(BUSINESS)};
  `);

  // --- the workspace, exactly what create_report_workspace would make ---
  out.push(`
    insert into public.report_workspaces
      (owner_user_id, kind, business_name, currency, first_month, target_hourly_rate,
       benchmark_business_description, benchmark_main_offers, benchmark_country)
    values (${q(userId)}, 'retainer', ${q(BUSINESS)}, 'GBP', ${q(MONTHS[0])}, 200,
       ${q("A small branding and content studio for service businesses.")},
       ${q("1:1 coaching, a group programme, VIP days and done-with-you launches.")},
       ${q("United Kingdom")});
    insert into public.report_access (workspace_id, user_id, role, display_name, assigned_by)
    values (${w}, ${q(userId)}, 'client', ${q("Lemon Studio")}, ${q(adminId)});
  `);

  // --- entities ---------------------------------------------------------
  const entities = [
    ...PLATFORMS.map(
      (p, i) => `(${w}, 'social_platform', ${q(p.name)}, ${i}, null, null, null, null, '${p.kind}')`,
    ),
    ...OFFERS.map((o, i) => `(${w}, 'offer', ${q(o.name)}, ${i}, ${o.price}, '${o.model}', ${o.hourlyCost}, null, null)`),
    ...CAMPAIGNS.map((c, i) => `(${w}, 'ad_campaign', ${q(c.name)}, ${i}, null, null, null, '${c.goal}', null)`),
  ];
  out.push(`insert into public.report_entities
      (workspace_id, entity_type, name, sort_order, price, pricing_model, hourly_cost, campaign_goal,
       platform_kind)
    values ${entities.join(",\n      ")};`);
  // Funnels after the offers they sell, so the link can be looked up.
  out.push(`insert into public.report_entities
      (workspace_id, entity_type, name, sort_order, linked_offer_id)
    values ${FUNNELS.map((f, i) => `(${w}, 'funnel', ${q(f.name)}, ${i}, ${ent("offer", f.offer)})`).join(",\n      ")};`);

  // --- months, published except the current one -------------------------
  out.push(`insert into public.report_periods (workspace_id, month, published_at, published_by)
    values ${MONTHS.map((m) =>
      m === NOW
        ? `(${w}, ${q(m)}, null, null)`
        : `(${w}, ${q(m)}, ${q(`${m} 09:30:00+00`)}, ${q(adminId)})`,
    ).join(",\n      ")};`);

  // --- every typed figure ------------------------------------------------
  const values = [];
  const put = (month, key, value, entity = "null") => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    values.push(`(${w}, ${q(month)}, ${q(key)}, ${entity}, ${n(value)}, ${q(adminId)})`);
  };

  MONTHS.forEach((month, i) => {
    for (const p of PLATFORMS) {
      const figures = platformMonth(p, i, MONTHS.length);
      for (const [key, value] of Object.entries(figures)) put(month, key, value, ent("social_platform", p.name));
    }
    for (const [key, value] of Object.entries(trialReelsMonth(i))) put(month, key, value);
    for (const [key, value] of Object.entries(emailMonth(i, MONTHS.length))) put(month, key, value);
    for (const f of FUNNELS) {
      for (const [key, value] of Object.entries(funnelMonth(f, i, MONTHS.length))) put(month, key, value, ent("funnel", f.name));
    }
    for (const c of CAMPAIGNS) {
      const figures = campaignMonth(c, i, MONTHS.length);
      for (const [key, value] of Object.entries(figures)) put(month, key, value, ent("ad_campaign", c.name));
    }
    const leads = leadsMonth(i);
    for (const [key, value] of Object.entries(leads)) put(month, key, value);
    // What those converted calls bought (§5.6): the offers, and the
    // bespoke line for work priced per job — which for an agency client
    // is often the biggest thing on the chart.
    const converted = leads.leads_conversions_calls_converted;
    const bespoke = bespokeWins(i, converted);
    for (const { offer, sales } of callWins(i, MONTHS.length, converted - (bespoke.sales ?? 0))) {
      put(month, "leads_conversions_sales_from_calls", sales, ent("offer", offer));
    }
    put(month, "leads_conversions_bespoke_sales_from_calls", bespoke.sales);
    put(month, "leads_conversions_value_of_bespoke_sales_from_calls", bespoke.value);
    for (const [key, value] of Object.entries(clientExperienceMonth(i))) put(month, key, value);
    for (const o of OFFERS) {
      const { values: v } = offerMonth(o, i, MONTHS.length);
      for (const [key, value] of Object.entries(v)) put(month, key, value, ent("offer", o.name));
    }
    put(month, "financials_cash_in_bank_at_month_end", Math.round(18_400 + i * 1_950 + (i % 3) * 820));
  });
  // The opening figure belongs to the first month only (§5.8).
  put(MONTHS[0], "client_experience_clients_at_start_opening", 14);

  for (let i = 0; i < values.length; i += 400) {
    out.push(`insert into public.report_values
        (workspace_id, month, metric_key, entity_id, value, entered_by)
      values ${values.slice(i, i + 400).join(",\n        ")};`);
  }

  return { out, w, ent, row, values: values.length };
}

export { buildSql, BUSINESS, DEMO_EMAIL, MONTHS, PAST, NOW, demoUser, runSql, env, LOCAL, q, n };
