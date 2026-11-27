/**
 * The code and the invitation email, held to each other.
 *
 * The template is the one piece of wording in aOS that lives in the
 * Supabase dashboard rather than in this repository: no deploy touches
 * it, no review sees it, and nothing in the app reads it. So the copy
 * that Dom pastes in is kept in `docs/reporting/invite-email-template.html`
 * and this asserts the two agree — a kind the code sends with no branch
 * in the template is an invitation that quietly reads as somebody else's.
 *
 * It cannot prove the dashboard holds this file. What it can prove is
 * that the file Dom was given covers every kind the code can send, and
 * that nobody has edited one branch's link and not the others — which is
 * the mistake that would lock a client out of the account they were just
 * invited to.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ACCOUNT_KINDS, accountKindForWorkspace, inviteData } from "./invite-kind.ts";

const TEMPLATE = readFileSync("docs/reporting/invite-email-template.html", "utf8");

/** The link, which every branch has to carry unchanged. */
const CONFIRM_LINK =
  '<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password">Accept invitation</a>';

test("every kind the code sends has a branch in the template", () => {
  // `member` is the final `else` rather than a named branch, on purpose:
  // an invitation sent before 27 November 2026 carries no account_kind at
  // all and has to keep reading as it did.
  for (const kind of ACCOUNT_KINDS.filter((k) => k !== "member")) {
    assert.match(
      TEMPLATE,
      new RegExp(`eq \\(printf "%v" \\.Data\\.account_kind\\) "${kind}"`),
      `${kind} is sent by the code and has no branch in the template`,
    );
  }
  assert.match(TEMPLATE, /\{\{ else \}\}/, "and the member wording is the else");
});

test("the member wording is still Nina's, word for word", () => {
  // Read out of the live project on 27 November 2026. If this changes,
  // it should be because she changed it.
  assert.ok(
    TEMPLATE.includes(
      "I've set up your login for aOS - everything you're going to come to love over the next few months lives here.",
    ),
  );
  assert.ok(TEMPLATE.includes("<p>See you inside wooo!!<br>Nina x</p>"));
});

test("every branch carries the same confirm link", () => {
  const links = TEMPLATE.split("Accept invitation</a>").length - 1;
  assert.equal(
    TEMPLATE.split(CONFIRM_LINK).length - 1,
    links,
    "a branch has a link that is not the one that works",
  );
  // One per branch: three named, plus the member else.
  assert.equal(links, ACCOUNT_KINDS.length);
});

test("no branch was left comparing a missing kind directly", () => {
  // `eq` on an absent `.Data.account_kind` raises, and a template that
  // raises sends NO EMAIL. `printf "%v"` is what makes it a string first.
  const bare = TEMPLATE.match(/eq \.Data\.account_kind/g);
  assert.equal(bare, null, "that branch sends nothing at all when the kind is absent");
});

test("the metadata key is the one the template reads", () => {
  assert.deepEqual(inviteData("retainer"), { account_kind: "retainer" });
  assert.match(TEMPLATE, /\.Data\.account_kind/);
});

test("a reporting workspace's kind is the account kind", () => {
  assert.equal(accountKindForWorkspace("retainer"), "retainer");
  assert.equal(accountKindForWorkspace("chiarezza"), "chiarezza");
});
