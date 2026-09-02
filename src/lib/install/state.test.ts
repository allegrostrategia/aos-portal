import assert from "node:assert/strict";
import { test } from "node:test";

import { installState, isIos } from "./state.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const base = { isStandalone: false, canPrompt: false, dismissed: false };

test("already installed means there is nothing to say", () => {
  assert.equal(
    installState({ ...base, userAgent: IPHONE, isStandalone: true }),
    "installed",
  );
});

test("installed wins even over a dismissal", () => {
  assert.equal(
    installState({ ...base, userAgent: IPHONE, isStandalone: true, dismissed: true }),
    "installed",
  );
});

test("a browser that can install gets the button", () => {
  assert.equal(
    installState({ ...base, userAgent: ANDROID, canPrompt: true }),
    "prompt",
  );
});

// The case the whole feature exists for: iOS has no install API at all, so
// without the guide an iPhone member has no route to the home screen — and
// therefore no route to push notifications later.
test("an iPhone gets the instructions, because there is no other way", () => {
  assert.equal(installState({ ...base, userAgent: IPHONE }), "ios-guide");
});

test("a desktop browser is left alone", () => {
  assert.equal(installState({ ...base, userAgent: DESKTOP }), "none");
});

test("dismissing it means it stays dismissed", () => {
  assert.equal(
    installState({ ...base, userAgent: IPHONE, dismissed: true }),
    "none",
  );
  assert.equal(
    installState({ ...base, userAgent: ANDROID, canPrompt: true, dismissed: true }),
    "none",
  );
});

test("iPhones and iPads are recognised, plain desktops are not", () => {
  assert.equal(isIos(IPHONE), true);
  assert.equal(isIos(ANDROID), false);
  // A Mac with no touch points — navigator is undefined under node:test, which
  // is the same answer as a real desktop reporting zero.
  assert.equal(isIos(DESKTOP), false);
});
