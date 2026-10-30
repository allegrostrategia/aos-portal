import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Standing rule 8: the only address a member or client ever sees is
 * contact@allegrobusinessservices.co.uk.
 *
 * A rule in CLAUDE.md is a rule somebody has to remember. This is the same
 * rule where it cannot be forgotten — it reads the source, so a new page, a
 * new email body or a copied-and-pasted footer is covered the day it is
 * written rather than the day somebody notices.
 *
 * `hello@allegrocaptures.co.uk` is Allegro Captures, a different business of
 * Dom's. `hello@allegrostrategia.com` was the contact address on three
 * screens until 30 October 2026 and is not one any more.
 */

const BANNED = ["hello@allegrocaptures.co.uk", "hello@allegrostrategia.com"];

/** Every .ts/.tsx under src, which is all of the app a person can read. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test("no banned address appears anywhere a member or client could read it", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles("src")) {
    // This file names them in order to ban them.
    if (file.endsWith(path.join("email", "addresses.test.ts"))) continue;

    const text = readFileSync(file, "utf8");
    for (const address of BANNED) {
      if (text.includes(address)) offenders.push(`${file}: ${address}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Standing rule 8: use contact@allegrobusinessservices.co.uk.\n${offenders.join("\n")}`,
  );
});

test("the sending identity is the no-reply address, not a person's", () => {
  // Read rather than imported: `send.ts` is "server-only", which throws
  // outside a server component, and the question here is what the source
  // says anyway.
  //
  // Not a contact address and not meant to be replied to, which is why it is
  // allowed to be an allegrostrategia.com one: it is the verified Resend
  // domain. If this ever becomes something a client would reply to, rule 8
  // applies to it too.
  const send = readFileSync(path.join("src", "lib", "email", "send.ts"), "utf8");
  const fallback = /return process\.env\.EMAIL_FROM \?\? "([^"]+)"/.exec(send);

  assert.ok(fallback, "emailFrom() no longer has a literal default to check");
  assert.match(fallback[1], /noreply@/);
});
