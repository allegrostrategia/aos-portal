import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Normally `.next`. The browser tests set NEXT_DIST_DIR so their dev
   * server builds somewhere else.
   *
   * Next 16 refuses to start a second dev server in a directory that
   * already has one — the lock lives in the build directory — so without
   * this, running the Playwright suite means first killing the dev server
   * you are working in. Two build directories, two servers, no lock
   * between them.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  /**
   * The browser tests drive `127.0.0.1`, and Next's dev server decides
   * its own origin is `localhost` — so it treats every request from the
   * tests as cross-origin and answers **403 for its own JavaScript
   * chunks.** The page renders, nothing hydrates, and no error says so:
   * a client component simply never attaches its handlers.
   *
   * That is almost certainly what has been behind "hydration-dependent
   * controls have failed every time in this build" — three of them, over
   * three stages, each diagnosed as a React problem and worked around by
   * rewriting the control in plain HTML. The workarounds were good
   * anyway. The diagnosis was wrong.
   *
   * Dev only; `next build` ignores it. The same origin mismatch is what
   * made `/api/launch-cover` log a person out on 9 October.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
