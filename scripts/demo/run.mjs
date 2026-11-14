/**
 * Build the demo year and apply it. See seed-demo-workspace.mjs for why
 * this goes in as SQL rather than through the app's own actions.
 */
import crypto from "node:crypto";

import {
  buildSql, BUSINESS, DEMO_EMAIL, MONTHS, NOW, demoUser, runSql, env, LOCAL, q,
} from "./seed-demo-workspace.mjs";
import { buildRest } from "./build2.mjs";

const target = (process.argv.find((a) => a.startsWith("--target=")) ?? "").split("=")[1];
const dryRun = process.argv.includes("--dry-run");
const CURRENT_MONTH = "2026-11";

const config = target === "local"
  ? { ...LOCAL, serviceKey: await (async () => {
      const { localConfig } = await import("../seed-test-db.mjs");
      return localConfig().serviceKey;
    })() }
  : await env();

// A password Nina can be given, not one anybody can guess.
const password = process.env.DEMO_PASSWORD ?? `Lemon-${crypto.randomBytes(6).toString("base64url")}-2026`;

const user = dryRun
  ? { id: "00000000-0000-0000-0000-000000000001", created: false }
  : await demoUser(config, password);

/** An admin to stand as the author of the published months. */
async function adminId() {
  if (dryRun) return "00000000-0000-0000-0000-000000000002";
  const rows = await runSql(`select id::text from public.members where role = 'admin' order by created_at limit 1;`);
  const found = Array.isArray(rows) ? rows[0]?.id : null;
  return found ?? user.id;
}

const admin = await adminId();

const { out, w, ent, row, values } = buildSql(user.id, admin);
out.push(...buildRest({ w, ent, row, adminId: admin, MONTHS, NOW, currentMonth: CURRENT_MONTH }));

const sql = ["begin;", ...out, "commit;"].join("\n\n");

if (dryRun) {
  console.log(sql.slice(0, 4000));
  console.log(`\n… ${sql.length} characters, ${out.length} statements, ${values} figures`);
  process.exit(0);
}

console.log(`Applying to ${target}: ${out.length} statements, ${values} figures, ${MONTHS.length} months.`);

/**
 * **In batches, with the teardown held back.** A megabyte of SQL in one
 * Management API call is refused, and each call is its own session, so
 * there is no transaction spanning them. The teardown is `out[0]` and
 * is keyed to this business name alone — so a batch that fails is
 * cleaned up by running it again rather than left half-written on the
 * live database.
 */
const teardown = out[0];
try {
  for (let i = 0; i < out.length; i += 6) {
    const batch = out.slice(i, i + 6);
    await runSql(["begin;", ...batch, "commit;"].join("\n"));
    process.stdout.write(`  batch ${String(i / 6 + 1).padStart(2)} of ${Math.ceil(out.length / 6)} ✓\n`);
  }
} catch (error) {
  console.error("\nFailed part-way. Rolling the demo workspace back so nothing half-written is left.");
  await runSql(["begin;", teardown, "commit;"].join("\n"));
  throw error;
}

const check = async (label, query) => {
  const rows = await runSql(query);
  console.log(`  ${label.padEnd(28)} ${JSON.stringify(Array.isArray(rows) ? rows[0] : rows)}`);
};
const W = `(select id from public.report_workspaces where business_name = ${q(BUSINESS)})`;
console.log("\nRead back:");
await check("workspace", `select business_name, kind, first_month::text, currency from public.report_workspaces where business_name = ${q(BUSINESS)};`);
await check("months (published)", `select count(*)::int total, count(published_at)::int published from public.report_periods where workspace_id = ${W};`);
await check("figures", `select count(*)::int from public.report_values where workspace_id = ${W};`);
await check("entities", `select count(*)::int from public.report_entities where workspace_id = ${W};`);
await check("sales rows / actuals", `select (select count(*)::int from public.report_sales_rows where workspace_id = ${W}) rows, (select count(*)::int from public.report_actuals where workspace_id = ${W}) actuals;`);
await check("expenses", `select count(*)::int from public.report_expenses where workspace_id = ${W};`);
await check("client hours", `select count(*)::int from public.report_client_hours where workspace_id = ${W};`);
await check("top posts / items", `select (select count(*)::int from public.report_top_posts where workspace_id = ${W}) posts, (select count(*)::int from public.report_top_items where workspace_id = ${W}) items;`);
await check("launches / stages / values", `select (select count(*)::int from public.report_launches where workspace_id = ${W}) launches, (select count(*)::int from public.report_launch_stages s join public.report_launches l on l.id = s.launch_id where l.workspace_id = ${W}) stages, (select count(*)::int from public.report_launch_values v join public.report_launches l on l.id = v.launch_id where l.workspace_id = ${W}) vals;`);
await check("notes / targets", `select (select count(*)::int from public.report_notes where workspace_id = ${W}) notes, (select count(*)::int from public.report_targets where workspace_id = ${W}) targets;`);

console.log(`\nDemo client login: ${DEMO_EMAIL}`);
if (!process.env.DEMO_PASSWORD) console.log(`Password: ${password}`);
