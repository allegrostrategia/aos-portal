import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The browser tests run against the local stack, or they do not run.
 *
 * Dom's rule, 6 October: never against live, never as a real admin login.
 * A convention would not hold — these tests sign in, type figures and
 * publish months, and pointed at the live project they would do all of
 * that to a real client's report. So it is a check that throws, imported
 * by every spec, and it asks the one question with a reliable answer: is
 * this host the local stack?
 *
 * Asked that way round deliberately. "Is this the live project" needs a
 * list of project refs that somebody has to remember to keep current, and
 * the day it goes stale is the day it matters.
 */

export interface LocalStack {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cached: LocalStack | null = null;

export function localStack(): LocalStack {
  if (cached) return cached;

  let status: Record<string, string>;
  try {
    status = JSON.parse(
      execFileSync("npx", ["supabase", "status", "-o", "json"], {
        // __dirname, not import.meta: Playwright transpiles specs to
        // CommonJS, where import.meta is a syntax error.
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error(
      "The local Supabase stack is not running. Start it with:\n" +
        "  colima start        (after a restart; the VM does not come back on its own)\n" +
        "  npx supabase start\n" +
        "  node scripts/seed-test-db.mjs",
    );
  }

  const url = status.API_URL;
  assertLocal(url);

  cached = { url, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
  return cached;
}

export function assertLocal(url: string | undefined): string {
  if (!url) {
    throw new Error("No Supabase URL at all. Refusing to run the browser tests.");
  }
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `REFUSING TO RUN: the browser tests are pointed at ${url}.\n` +
        "They sign in, enter figures and publish months. Against a cloud project " +
        "that means doing it to somebody's real report.\n" +
        "They run against the local stack only — npx supabase start.",
    );
  }
  return url;
}

/** The fake people. Nobody here has a login on anything real. */
export const PEOPLE = {
  nina: { email: "nina@aos.test", password: "test-password-nina", name: "Nina Test" },
  elize: { email: "elize@aos.test", password: "test-password-elize", name: "Elize Test" },
  client: { email: "client@aos.test", password: "test-password-client", name: "Bella Test" },
  member: { email: "member@aos.test", password: "test-password-member", name: "Ruth Test" },
} as const;

export const MONTHS = { jul: "2026-07", aug: "2026-08", sep: "2026-09" } as const;
