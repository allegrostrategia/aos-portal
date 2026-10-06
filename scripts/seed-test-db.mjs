/**
 * Four fake people and two fake businesses, on the local stack.
 *
 *   npx supabase start && node scripts/seed-test-db.mjs
 *
 * **Nobody here is real.** The browser tests sign in as these accounts and
 * nothing else — not Nina's login, not Dom's, not Test Client's. The local
 * stack is the only database this will talk to: `assertLocal()` refuses
 * anything else, and that guard is the point rather than a formality,
 * because a seed script pointed at production would create accounts on it.
 *
 * Re-runnable. It clears what it made and makes it again, so one run
 * cannot colour the next — the trap that cost three mutation-test rounds
 * this week was fixtures that already looked like the expected answer.
 */
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DB_CONTAINER = "supabase_db_aos-portal";

export const PEOPLE = {
  nina: { email: "nina@aos.test", password: "test-password-nina", name: "Nina Test" },
  elize: { email: "elize@aos.test", password: "test-password-elize", name: "Elize Test" },
  client: { email: "client@aos.test", password: "test-password-client", name: "Bella Test" },
  member: { email: "member@aos.test", password: "test-password-member", name: "Ruth Test" },
};

export const RETAINER = "Northwind Studio";
export const SELF_SERVE = "Ruth Test Coaching";
export const MONTHS = { jul: "2026-07-01", aug: "2026-08-01", sep: "2026-09-01" };

export function localConfig() {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

/**
 * The guard.
 *
 * Asked as "is this the local stack" rather than "is this the live
 * project", because the first has one answer and the second needs a list
 * somebody has to remember to keep up to date.
 */
export function assertLocal(url) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Refusing to touch ${url}. This runs against the local Supabase stack only ` +
        `(npx supabase start). Nothing here may reach a cloud project, least of all the live one.`,
    );
  }
  return url;
}

/** SQL straight into the stack's own Postgres. No driver dependency. */
export function sql(text) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], {
    input: text,
    encoding: "utf8",
  }).trim();
}

/** One value back, for `select ... ;` */
function one(text) {
  const out = sql(text);
  return out.split("\n").filter(Boolean).at(-1) ?? "";
}

async function admin(config, path, init = {}) {
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

async function upsertUser(config, person) {
  const page = await admin(config, "/auth/v1/admin/users?page=1&per_page=200");
  const existing = (page.users ?? page).find((u) => u.email === person.email);
  if (existing) {
    await admin(config, `/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: person.password, email_confirm: true }),
    });
    return existing.id;
  }
  const created = await admin(config, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: person.email, password: person.password, email_confirm: true }),
  });
  return created.id;
}

/** Run a block as Nina, so the seed goes through the policies, not around them. */
function asNina(ninaId, body) {
  return sql(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${ninaId}', true);
    ${body}
    commit;
  `);
}

export async function seed({ quiet = false } = {}) {
  const config = localConfig();
  assertLocal(config.url);

  const ids = {};
  for (const [key, person] of Object.entries(PEOPLE)) {
    ids[key] = await upsertUser(config, person);
  }

  sql(`
    delete from public.report_values;
    delete from public.report_notes;
    delete from public.report_top_items;
    delete from public.report_periods;
    delete from public.report_entities;
    delete from public.report_access;
    delete from public.report_workspaces;
    delete from public.members where email like '%@aos.test';
    insert into public.members (id, email, full_name, role, status) values
      ('${ids.nina}', '${PEOPLE.nina.email}', '${PEOPLE.nina.name}', 'admin', 'active'),
      ('${ids.member}', '${PEOPLE.member.email}', '${PEOPLE.member.name}', 'member', 'active');
  `);

  asNina(ids.nina, `
    select public.create_report_workspace(
      '${ids.client}', 'retainer', '${RETAINER}', '${PEOPLE.client.name}', '${MONTHS.jul}');
    select public.create_report_workspace(
      '${ids.member}', 'aos_member', '${SELF_SERVE}', '${PEOPLE.member.name}', '${MONTHS.jul}');
  `);

  const retainerId = one(
    `select id from public.report_workspaces where business_name = '${RETAINER}';`,
  );
  const selfServeId = one(
    `select id from public.report_workspaces where business_name = '${SELF_SERVE}';`,
  );

  asNina(ids.nina, `
    select public.assign_report_team_member(
      '${retainerId}', '${ids.elize}', '${PEOPLE.elize.name}');
  `);

  // Figures for three months, as the service role, which is how the cron
  // and the importer write. Deliberately NOT an opening figure: the first
  // browser test is the screen asking for one.
  const v = (month, key, value) =>
    `insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
     values ('${retainerId}', '${month}', '${key}', ${value}, '${ids.nina}');`;

  sql(`
    ${v(MONTHS.jul, "client_experience_clients_who_left", 1)}
    ${v(MONTHS.jul, "leads_conversions_new_clients", 3)}
    ${v(MONTHS.aug, "client_experience_clients_who_left", 2)}
    ${v(MONTHS.aug, "leads_conversions_new_clients", 5)}
    ${v(MONTHS.aug, "leads_conversions_new_leads_from_social", 12)}
    ${v(MONTHS.aug, "leads_conversions_new_leads_from_email", 6)}
    ${v(MONTHS.sep, "client_experience_clients_who_left", 0)}
    ${v(MONTHS.sep, "leads_conversions_new_clients", 4)}
    ${v(MONTHS.sep, "client_experience_renewals_and_upsells", 2)}
    ${v(MONTHS.sep, "client_experience_issues_raised", 1)}
    ${v(MONTHS.sep, "leads_conversions_new_leads_from_social", 20)}
    ${v(MONTHS.sep, "leads_conversions_new_leads_from_email", 8)}
    ${v(MONTHS.sep, "financials_fixed_costs", 300)}
    ${v(MONTHS.sep, "financials_variable_costs", 250)}
    ${v(MONTHS.sep, "financials_team_costs", 500)}

    -- July and August published, September still a draft: the state the
    -- "client sees dashes while an earlier month is a draft" test needs.
    insert into public.report_periods (workspace_id, month, published_at, published_by)
    values ('${retainerId}', '${MONTHS.jul}', now(), '${ids.nina}'),
           ('${retainerId}', '${MONTHS.aug}', now(), '${ids.nina}');
    insert into public.report_periods (workspace_id, month)
    values ('${retainerId}', '${MONTHS.sep}');
  `);

  // Ads (§5.7): the §10.2 sample's shape — lead campaigns, a sales one,
  // a profile-visit one, and one nobody has classified, which is the
  // case the whole cost-per-lead rule turns on.
  const campaign = (name, goal) =>
    `insert into public.report_entities (workspace_id, entity_type, name, campaign_goal)
     values ('${retainerId}', 'ad_campaign', '${name}', ${goal ? `'${goal}'` : "null"});`;

  sql(`
    ${campaign("Lead form", "leads")}
    ${campaign("Workshop opt-in", "leads")}
    ${campaign("Retargeting sales", "sales")}
    ${campaign("Profile visits", "profile_visits")}
    ${campaign("Unclassified", null)}
  `);

  const spendFor = {
    "Lead form": { spend: 250, leads: 60, clicks: 2000, impressions: 30000 },
    "Workshop opt-in": { spend: 150, leads: 40, clicks: 1500, impressions: 20000 },
    "Retargeting sales": { spend: 50, leads: 0, clicks: 400, impressions: 5000 },
    "Profile visits": { spend: 100, leads: 0, clicks: 0, impressions: 3000 },
    Unclassified: { spend: 50, leads: 0, clicks: 300, impressions: 2000 },
  };

  for (const [name, f] of Object.entries(spendFor)) {
    sql(`
      insert into public.report_values (workspace_id, month, metric_key, entity_id, value, entered_by)
      select '${retainerId}', '${MONTHS.sep}', k.key, e.id, k.value, '${ids.nina}'
        from public.report_entities e,
             (values ('ads_spend', ${f.spend}), ('ads_leads', ${f.leads}),
                     ('ads_link_clicks', ${f.clicks}), ('ads_impressions', ${f.impressions}))
               as k(key, value)
       where e.workspace_id = '${retainerId}' and e.name = '${name}';
    `);
  }

  // Funnels (§5.5): an offer with a price, a funnel selling it, and one
  // funnel selling nothing — the dash case. July's figures are saved
  // before the price rises, so a browser test can watch the month keep
  // its own price.
  sql(`
    insert into public.report_entities (workspace_id, entity_type, name, price, pricing_model, hourly_cost)
    values ('${retainerId}', 'offer', 'Signature programme', 500, 'one_off', 40);
    insert into public.report_entities (workspace_id, entity_type, name, linked_offer_id)
    select '${retainerId}', 'funnel', 'Webinar funnel', id
      from public.report_entities
     where workspace_id = '${retainerId}' and entity_type = 'offer' and name = 'Signature programme';
    insert into public.report_entities (workspace_id, entity_type, name)
    values ('${retainerId}', 'funnel', 'Unlinked funnel');
  `);

  const funnelValue = (month, key, value, funnel) =>
    `insert into public.report_values (workspace_id, month, metric_key, entity_id, value, entered_by)
     select '${retainerId}', '${month}', '${key}', e.id, ${value}, '${ids.nina}'
       from public.report_entities e
      where e.workspace_id = '${retainerId}' and e.name = '${funnel}';`;

  // July: saved at £500, then published. Its price must never move.
  sql(`
    ${funnelValue(MONTHS.jul, "funnels_landing_page_views", 1000, "Webinar funnel")}
    ${funnelValue(MONTHS.jul, "funnels_opt_ins", 200, "Webinar funnel")}
    ${funnelValue(MONTHS.jul, "funnels_purchases", 10, "Webinar funnel")}
    ${funnelValue(MONTHS.jul, "funnels_offer_price_at_month", 500, "Webinar funnel")}
  `);

  // September is a draft, captured at £500, and the offer now sells for
  // £800 — which is the state the correction button exists for.
  sql(`
    ${funnelValue(MONTHS.sep, "funnels_landing_page_views", 2000, "Webinar funnel")}
    ${funnelValue(MONTHS.sep, "funnels_opt_ins", 500, "Webinar funnel")}
    ${funnelValue(MONTHS.sep, "funnels_purchases", 8, "Webinar funnel")}
    ${funnelValue(MONTHS.sep, "funnels_offer_price_at_month", 500, "Webinar funnel")}
    ${funnelValue(MONTHS.sep, "funnels_landing_page_views", 400, "Unlinked funnel")}
    ${funnelValue(MONTHS.sep, "funnels_purchases", 3, "Unlinked funnel")}
    update public.report_entities set price = 800
     where workspace_id = '${retainerId}' and name = 'Signature programme';
  `);

  const out = { config, ids, retainerId, selfServeId };
  if (!quiet) {
    console.log(`seeded ${config.url}`);
    console.log(`  ${RETAINER} ${retainerId}`);
    console.log(`  ${SELF_SERVE} ${selfServeId}`);
    for (const [key, p] of Object.entries(PEOPLE)) console.log(`  ${key.padEnd(7)} ${p.email}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
