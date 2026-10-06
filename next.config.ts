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
};

export default nextConfig;
