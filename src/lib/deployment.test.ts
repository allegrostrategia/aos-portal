import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deploymentLabel,
  deploymentOf,
  shouldRefuseUnconfigured,
  shouldWarnAboutDeployment,
} from "./deployment.ts";

test("VERCEL_ENV names the deployment; its absence means a machine", () => {
  assert.equal(deploymentOf("production"), "production");
  assert.equal(deploymentOf("preview"), "preview");
  assert.equal(deploymentOf("development"), "development");
  assert.equal(deploymentOf(undefined), "local");
  assert.equal(deploymentOf(""), "local");
  assert.equal(deploymentOf("staging"), "local", "an unknown value isn't assumed to be live");
});

// The whole point: production must never wear it, and a preview always must.
test("only a deployment that isn't production warns", () => {
  assert.equal(shouldWarnAboutDeployment("production"), false);
  assert.equal(shouldWarnAboutDeployment("preview"), true);
  assert.equal(shouldWarnAboutDeployment("development"), true);
  assert.equal(shouldWarnAboutDeployment("local"), false, "the address bar already says localhost");
});

test("the banner names where you actually are", () => {
  assert.equal(
    deploymentLabel("preview", "aos-portal-git-main-abc.vercel.app"),
    "Preview build — not the live app · aos-portal-git-main-abc.vercel.app",
  );
  assert.equal(deploymentLabel("preview", undefined), "Preview build — not the live app");
});

test("a deployment with no database refuses; a laptop without one doesn't", () => {
  assert.equal(shouldRefuseUnconfigured("preview", false), true);
  assert.equal(shouldRefuseUnconfigured("production", false), true);
  assert.equal(shouldRefuseUnconfigured("local", false), false);
  // And a configured deployment is never refused.
  assert.equal(shouldRefuseUnconfigured("preview", true), false);
});
