import assert from "node:assert/strict";
import { test } from "node:test";

import { canEdit, canPublish, canView, canWriteStrategistNote } from "./access.ts";

const retainerClient = { role: "client", kind: "retainer", isAdmin: false } as const;
const retainerTeam = { role: "team", kind: "retainer", isAdmin: false } as const;
const member = { role: "client", kind: "aos_member", isAdmin: false } as const;
const chiarezza = { role: "client", kind: "chiarezza", isAdmin: false } as const;
const nina = { role: null, kind: "retainer", isAdmin: true } as const;
const stranger = { role: null, kind: "retainer", isAdmin: false } as const;

test("a retainer client views and comments, and never edits", () => {
  // §2's role table. Confirmed live on 1 October: signed in as one, the
  // report page carried no "Enter data", no "Save draft" and no publish
  // control anywhere in the HTML.
  assert.equal(canView(retainerClient), true);
  assert.equal(canEdit(retainerClient), false);
  assert.equal(canWriteStrategistNote(retainerClient), false);
  assert.equal(canPublish(retainerClient), false);
});

test("Elize edits the clients she is assigned to, and publishes nothing", () => {
  assert.equal(canEdit(retainerTeam), true);
  assert.equal(canWriteStrategistNote(retainerTeam), true);
  assert.equal(canPublish(retainerTeam), false);
});

test("self-serve clients enter their own figures", () => {
  assert.equal(canEdit(member), true);
  assert.equal(canEdit(chiarezza), true);
});

test("a self-serve client still cannot write a strategist note about themselves", () => {
  assert.equal(canWriteStrategistNote(member), false);
  assert.equal(canWriteStrategistNote(chiarezza), false);
});

test("Nina does everything, with no grant of her own", () => {
  assert.equal(canView(nina), true);
  assert.equal(canEdit(nina), true);
  assert.equal(canWriteStrategistNote(nina), true);
  assert.equal(canPublish(nina), true);
});

test("somebody with no grant and no admin reaches nothing", () => {
  assert.equal(canView(stranger), false);
  assert.equal(canEdit(stranger), false);
  assert.equal(canWriteStrategistNote(stranger), false);
  assert.equal(canPublish(stranger), false);
});

test("the kind alone never grants anything", () => {
  // A self-serve workspace does not let a passer-by edit it; the grant is
  // what carries access, and the kind only decides what a client may do
  // with one.
  assert.equal(canEdit({ role: null, kind: "aos_member", isAdmin: false }), false);
  assert.equal(canEdit({ role: null, kind: "chiarezza", isAdmin: false }), false);
});
