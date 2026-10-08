/**
 * The dev server the browser tests drive.
 *
 * Its own port (3100) and its own environment, read from the running local
 * stack — so the dev server you may already have on 3000 against live is
 * never the one being clicked, typed into and published from.
 *
 * The keys are read from `supabase status` rather than written into the
 * repo. They are the standard local-stack keys and work only against
 * 127.0.0.1, but this repository is public and a file of things that look
 * like credentials is a bad habit to leave lying in one.
 */
import { execFileSync, spawn } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

let status;
try {
  status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
} catch {
  console.error(
    "The local Supabase stack is not running.\n" +
      "  colima start        (after a restart; the VM does not come back on its own)\n" +
      "  npx supabase start\n" +
      "  node scripts/seed-test-db.mjs",
  );
  process.exit(1);
}

const host = new URL(status.API_URL).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Refusing to start: ${status.API_URL} is not the local stack.`);
  process.exit(1);
}

const PORT = process.env.E2E_PORT ?? "3100";

spawn("npx", ["next", "dev", "--port", PORT], {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
    // Stage 3's tabs have no route in production yet, and the tests are
    // for the tabs. Development-only, enforced by NODE_ENV in categories.ts.
    // REPORTING_STAGE_OFF runs the app exactly as production has it, so
    // a test can watch Stage 3 not appear.
    // The highest stage being built, so the browser tests see the work in
    // progress — and so every earlier stage is exercised with the later
    // one switched on, which is where a regression would otherwise hide.
    NEXT_PUBLIC_REPORTING_STAGE: process.env.REPORTING_STAGE_OFF ? "2" : "4",
    // Its own build directory, or Next 16 refuses to start beside the dev
    // server already running on 3000.
    NEXT_DIST_DIR: process.env.REPORTING_STAGE_OFF ? ".next-e2e-stage2" : ".next-e2e",
  },
}).on("exit", (code) => process.exit(code ?? 0));
