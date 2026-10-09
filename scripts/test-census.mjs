#!/usr/bin/env node
/**
 * The test count can only go up, unless somebody says why.
 *
 * **Why this exists.** On 8 October a `Write` landed on top of
 * `src/lib/reporting/months.test.ts` and destroyed fourteen tests
 * covering `firstOfMonth`, `latestReportableMonth` and `resolveMonth`.
 * Nothing failed. The suite reported "463 passed" and was believed,
 * because a deleted test does not fail — it stops existing, and a
 * green count says nothing about what is no longer in it.
 *
 * So the counts are written down. Every run compares the suites against
 * `test-counts.json`:
 *
 *   · fewer tests than the baseline  → fail, naming the suite
 *   · more                           → fail, telling you to record them
 *   · the baseline itself lowered    → fail unless the same commit says
 *                                      why, in `droppedBecause`
 *
 * That last one is the part that makes it a guard rather than a
 * speed bump: lowering the number is the only way past, and lowering it
 * silently is refused. The reason is read from the working tree and
 * compared against `HEAD`, so it travels in the commit that did it.
 *
 * Usage:
 *   node scripts/test-census.mjs              unit + db
 *   node scripts/test-census.mjs --with-e2e   and the browser suite
 *   node scripts/test-census.mjs --update     record what is there now
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASELINE = new URL("../test-counts.json", import.meta.url);
const args = new Set(process.argv.slice(2));
const update = args.has("--update");
const withE2e = args.has("--with-e2e");

/** `ℹ tests 483` from node:test, or `483 passed` from Playwright. */
function countFrom(output, kind) {
  if (kind === "node") {
    const m = [...output.matchAll(/^ℹ tests (\d+)$/gm)];
    // `npm test` chains several runners, so every total counts.
    return m.length ? m.reduce((sum, [, n]) => sum + Number(n), 0) : null;
  }
  const m = output.match(/(\d+) passed/);
  return m ? Number(m[1]) : null;
}

const SUITES = [
  { key: "unit", kind: "node", cmd: ["npm", ["run", "test:unit"]] },
  { key: "db", kind: "node", cmd: ["npm", ["run", "test:db"]] },
  ...(withE2e
    ? [{ key: "e2e", kind: "playwright", cmd: ["npx", ["playwright", "test", "--reporter=line"]] }]
    : []),
];

const previous = JSON.parse(readFileSync(BASELINE, "utf8"));
const found = {};
let failed = false;

for (const suite of SUITES) {
  const [bin, argv] = suite.cmd;
  const run = spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const count = countFrom(output, suite.kind);

  if (run.status !== 0) {
    console.error(`✖ ${suite.key}: the suite itself failed — fix that first.`);
    failed = true;
  }
  if (count === null) {
    console.error(`✖ ${suite.key}: could not read a test count from the output.`);
    failed = true;
    continue;
  }
  found[suite.key] = count;

  const expected = previous.counts[suite.key];
  if (expected === undefined) {
    console.log(`· ${suite.key}: ${count} — new suite, recording it.`);
  } else if (count < expected) {
    console.error(
      `✖ ${suite.key}: ${count} tests, down from ${expected}. ${expected - count} ` +
        `disappeared.\n  A deleted test does not fail, so this is the only thing that ` +
        `notices.\n  If they went on purpose, lower the number in test-counts.json and ` +
        `say why in "droppedBecause" — in the same commit.`,
    );
    failed = true;
  } else if (count > expected && !update) {
    console.error(
      `✖ ${suite.key}: ${count} tests, up from ${expected}. Run with --update to record them.`,
    );
    failed = true;
  } else {
    console.log(`✓ ${suite.key}: ${count}`);
  }
}

// Lowering the baseline is allowed, and saying nothing about it is not.
let committed = null;
try {
  committed = JSON.parse(execFileSync("git", ["show", "HEAD:test-counts.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  // No baseline in HEAD yet — the first commit of this file.
}
if (committed) {
  for (const [key, was] of Object.entries(committed.counts)) {
    const now = previous.counts[key];
    if (now !== undefined && now < was && !previous.droppedBecause) {
      console.error(
        `✖ test-counts.json lowers ${key} from ${was} to ${now} and does not say why.\n` +
          `  Add a "droppedBecause" line explaining which tests went, and what now covers them.`,
      );
      failed = true;
    }
  }
}

if (update && !failed) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ ...previous, counts: { ...previous.counts, ...found } }, null, 2)}\n`,
  );
  console.log("Recorded.");
}

process.exit(failed ? 1 : 0);
