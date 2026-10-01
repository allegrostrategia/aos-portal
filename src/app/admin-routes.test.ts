import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Every admin screen must refuse a non-admin itself.
 *
 * There is no layout under (portal)/admin doing it for them — each page calls
 * requireAdmin() on its own — so a new admin page added without that line is
 * reachable by any member, and nothing would say so. Keeping it out of the
 * navigation is not a gate; §13's rule is that access is refused, not hidden.
 *
 * Verified by hand on 1 October by signing in as a retainer client: both
 * /admin/reporting and /admin/members redirected to /no-access. This is the
 * part of that check that can run every time.
 */

const ADMIN_DIR = new URL("../../src/app/(portal)/admin", import.meta.url).pathname;

async function pagesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await pagesUnder(full)));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

test("every page under /admin gates itself", async () => {
  const pages = await pagesUnder(ADMIN_DIR);
  assert.ok(pages.length >= 10, `only found ${pages.length} admin pages — has the path moved?`);

  const ungated: string[] = [];
  for (const file of pages) {
    const source = await readFile(file, "utf8");

    // The call, not the word. `source.includes("requireAdmin(")` matches a
    // commented-out one just as happily — which is the likeliest way this
    // gate actually disappears, someone silencing it "for a minute". Caught
    // by mutating this very test's subject and watching it stay green.
    const gated = /^[ \t]*(?:await\s+)?(?:const\s+\w+\s*=\s*)?requireAdmin\(/m.test(source);
    // A page whose whole job is to forward somewhere else needs no gate of
    // its own: it renders nothing and the destination does its own checking.
    // /admin/roadmaps is the one of these — the separate roadmap editor went
    // away on 18 September and the old link still lands people correctly.
    const isPureRedirect =
      source.includes("redirect(") && !source.includes("return (");

    if (!gated && !isPureRedirect) ungated.push(path.relative(ADMIN_DIR, file));
  }

  assert.deepEqual(ungated, [], "admin pages with no requireAdmin() and no redirect");
});

test("the admin nav and the admin routes agree", async () => {
  // A link to a page that does not exist is a dead end; a page with no link
  // is unreachable. §13 wants exactly one route in to everything clickable.
  const layout = await readFile(
    new URL("../../src/app/(portal)/layout.tsx", import.meta.url).pathname,
    "utf8",
  );
  const linked = [...layout.matchAll(/href: "\/admin\/([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(linked.length >= 10, `only found ${linked.length} admin links in the sidebar`);

  const dirs = (await readdir(ADMIN_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const slug of linked) {
    assert.ok(dirs.includes(slug), `the sidebar links to /admin/${slug}, which has no page`);
  }
});
