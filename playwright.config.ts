import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, against the local Supabase stack and nothing else.
 *
 *   npx supabase start
 *   node scripts/seed-test-db.mjs
 *   npm run test:e2e
 *
 * **Never against live, and never as a real admin.** The guard is in
 * `e2e/guard.ts`, which every spec imports and which refuses to run
 * against any Supabase host but 127.0.0.1. It is a guard rather than a
 * convention because the failure it prevents — a browser test signing in
 * and writing to a real client's report — is not one you find out about
 * afterwards.
 *
 * Chrome that is already installed, rather than Playwright's own
 * Chromium: a few hundred megabytes saved, and it is the browser Nina and
 * her clients actually use. The phone project is real device emulation,
 * because Chrome headless has a 500px floor on window size and a "390px"
 * window is a cropped desktop render — three wrong fixes in September
 * before anybody measured.
 */

const PORT = 3100;
/** The same app with the flag where production has it. */
export const STAGE_2_PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  // Screenshots are the deliverable here as much as the assertions are, so
  // a flaky retry that quietly passes would hide a broken render.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      use: {
        // iPhone 14's metrics — 390x844, scale 3, touch — applied through
        // CDP by Chromium, not a small window: Chrome headless has a 500px
        // floor on window size, so a "390px" window is a cropped desktop
        // render. `devices[...]` carries defaultBrowserType: "webkit",
        // which is what has to be overridden to keep everything on the
        // Chrome that is actually installed.
        ...devices["iPhone 14"],
        browserName: "chromium",
        defaultBrowserType: "chromium",
        channel: "chrome",
      },
    },
  ],

  webServer: [
    {
      // Its own port and its own environment, so a dev server already
      // running against live cannot be the one the tests drive.
      command: "npm run dev:e2e",
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // The same app at the stage production is on, so a test can prove
      // that Stage 3 adds nothing to a screen a client already opens.
      // Without this, "it is behind the flag" is a claim about code
      // rather than something anybody has watched not happen.
      command: `E2E_PORT=${STAGE_2_PORT} npm run dev:e2e:stage2`,
      url: `http://127.0.0.1:${STAGE_2_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
