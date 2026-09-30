import assert from "node:assert/strict";
import { test } from "node:test";

import { isSendableOrigin, localOriginRefusal } from "./invite-origin.ts";

test("the live site is sendable", () => {
  assert.equal(isSendableOrigin("https://aos.allegrostrategia.com"), true);
  assert.equal(isSendableOrigin("https://aos.allegrostrategia.com/"), true);
});

test("a dev server is not", () => {
  // The whole point: these work for whoever sent the invitation and for
  // nobody else, so testing it yourself proves nothing.
  for (const origin of [
    "http://localhost:3000",
    "https://localhost",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
    "http://[::1]:3000",
    "http://doms-macbook.local:3000",
  ]) {
    assert.equal(isSendableOrigin(origin), false, origin);
  }
});

test("nothing at all is not sendable either", () => {
  assert.equal(isSendableOrigin(null), false);
  assert.equal(isSendableOrigin(undefined), false);
  assert.equal(isSendableOrigin("   "), false);
});

test("a hostname that merely contains localhost is still sendable", () => {
  // Being over-eager here would block a real send, which is the more
  // expensive mistake of the two.
  assert.equal(isSendableOrigin("https://localhost.allegrostrategia.com"), true);
  assert.equal(isSendableOrigin("https://notlocalhost.com"), true);
});

test("the refusal says what would have happened", () => {
  const message = localOriginRefusal("http://localhost:3000");
  assert.match(message, /localhost:3000/);
  assert.match(message, /only works on this machine/);
  assert.match(message, /aos\.allegrostrategia\.com/);
});
