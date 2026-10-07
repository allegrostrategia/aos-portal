/**
 * Freeze a snapshot onto every month that is already published.
 *
 * NOT RUN YET — shown to Dom with the migration, 7 October 2026.
 *
 * Without this, a month published before the snapshot existed reads as a
 * month that carried nothing, and `readCarried` sends it back to the live
 * walk — which is the behaviour the freeze is meant to end. So the column
 * and this pass belong to the same change.
 *
 * **It reuses the app's own `computeCarried`.** A SQL backfill would have
 * to reimplement the opening-figure walk, and §9's rule is that two
 * implementations of the same arithmetic will disagree; this one would
 * disagree silently, in rows nobody looks at again.
 *
 * Retainer workspaces only, matching the lock and `report_is_visible`: a
 * self-serve month has no "published" to speak of, and giving one a
 * snapshot would freeze figures its own owner is still editing.
 *
 * Idempotent. A month that already has a snapshot is skipped unless
 * `--force` is passed, so a re-run after a half-finished one is safe.
 *
 *   node scripts/backfill-carried.mjs            # say what it would do
 *   node scripts/backfill-carried.mjs --write    # do it
 *   node scripts/backfill-carried.mjs --write --force
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.join(import.meta.dirname, "..");
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("No Supabase keys in .env.local");

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// The app's own modules, so there is one implementation of the arithmetic.
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
const { computeCarried } = await import("../src/lib/reporting/carried-build.ts");

const periods = await rest(
  "report_periods?select=id,month,workspace_id,carried," +
    "report_workspaces!inner(business_name,kind)" +
    "&published_at=not.is.null&report_workspaces.kind=eq.retainer&order=month.asc",
);

console.log(`${periods.length} published retainer month(s).${WRITE ? "" : "  (dry run)"}\n`);

let written = 0;
let skipped = 0;
for (const period of periods) {
  const name = `${period.report_workspaces.business_name} ${period.month}`;
  const already = period.carried && Object.keys(period.carried).length > 0;
  if (already && !FORCE) {
    console.log(`  skip   ${name} — already has one`);
    skipped += 1;
    continue;
  }

  const carried = await computeCarried(period.workspace_id, period.month);
  const summary =
    `start=${carried.clientsAtStart ?? "—"}` +
    ` prev=${Object.keys(carried.previous).length}` +
    ` targets=${Object.keys(carried.targets).length}` +
    ` benchmarks=${Object.keys(carried.benchmarks).length}` +
    ` entities=${Object.keys(carried.entities).length}`;

  if (!WRITE) {
    console.log(`  would  ${name} — ${summary}`);
    continue;
  }

  // The service role passes guard_report_period_publish, which is what
  // lets this write `carried` at all.
  await rest(`report_periods?id=eq.${period.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ carried }),
  });
  console.log(`  wrote  ${name} — ${summary}`);
  written += 1;
}

console.log(
  `\n${WRITE ? `${written} written` : "nothing written (dry run)"}` +
    `${skipped ? `, ${skipped} skipped` : ""}.`,
);
