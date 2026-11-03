/**
 * Every word of the five reporting emails, as they arrive.
 *
 * **Nina's wording of 3 November, asserted line for line.** The same
 * arrangement as the two report panels in `highlights.ts`: her sentences
 * are in one place, and a screen or a refactor does not get to reword
 * them quietly. Where those are templates, these are whole emails, so
 * what is asserted here is the rendered text — greeting on its own line,
 * one blank line between paragraphs, the sign-off last.
 *
 * It lives in the db-test folder and touches no database. The copy
 * modules import through the `@/` alias, which Node knows nothing about
 * and `./hooks.mjs` teaches it; that is the only reason this is not a
 * `src/**` unit test.
 *
 * Two rules of hers are checked across all five rather than one at a
 * time, because they are the kind of thing a later edit breaks without
 * noticing: **no em dashes, single dashes only**, and the greeting is a
 * first name alone.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";

const { renderEmail, reportReminderCopy } = await import("../../src/lib/jobs/copy.ts");
const { PUBLISH_EMAIL } = await import("../../src/lib/reporting/publish-email.ts");
const { LAUNCH_EMAIL } = await import("../../src/lib/reporting/launch-email.ts");
const { greeting } = await import("../../src/lib/email/greeting.ts");

const URL = "https://aos.allegrostrategia.com/reporting?workspace=w&month=2026-08";
const LAUNCH_URL = "https://aos.allegrostrategia.com/reporting/launches/l";

/** The whole email, as a person reads it. */
const rendered = (copy) => renderEmail(copy);

test("the report is ready", () => {
  const copy = PUBLISH_EMAIL.first({
    // A full display name, which is what a client grant actually holds.
    name: "Bella Fawkes",
    businessName: "Bella Ltd",
    month: "2026-08-01",
    url: URL,
  });

  assert.equal(copy.subject, "Your August 2026 report is ready");
  assert.equal(
    rendered(copy),
    [
      "Bella,",
      "Your August 2026 report for Bella Ltd is ready for you!",
      "We'll go through the key bits on your monthly strategy call but please have a read through before then so you're in the loop.",
      "It covers where the month went, what we make of it, and what changes we're suggesting!",
      `Read it here: ${URL}`,
      "If you want to add any comments before the call, you can reply underneath the report itself and we'll pick it up there.",
      "Team Allegro",
    ].join("\n\n"),
  );
});

test("the report has been updated", () => {
  const copy = PUBLISH_EMAIL.update({
    name: "Bella Fawkes",
    businessName: "Bella Ltd",
    month: "2026-08-01",
    url: URL,
  });

  assert.equal(copy.subject, "Your August 2026 report has been updated");
  assert.equal(
    rendered(copy),
    [
      "Bella,",
      "We've updated your August 2026 report for Bella Ltd.",
      "Something in it needed correcting, so the version you read before isn't the current one.",
      `The updated report: ${URL}`,
      "This is now fully up to date.",
      "Team Allegro",
    ].join("\n\n"),
  );
});

test("the launch tracker has been updated, named after the offer", () => {
  const copy = LAUNCH_EMAIL.update({
    name: "Bella Fawkes",
    businessName: "Bella Ltd",
    launchName: "Autumn challenge",
    offerName: "The Freedom Experience",
    url: LAUNCH_URL,
  });

  // The offer, not the launch: the client knows what they sell, not what
  // the team called the campaign.
  assert.equal(copy.subject, "Your The Freedom Experience launch tracker has been updated");
  assert.equal(
    rendered(copy),
    [
      "Bella,",
      `We've updated the launch tracker for The Freedom Experience (Bella Ltd) - there are newer figures in it than the last time you looked.`,
      `See it here: ${LAUNCH_URL}`,
      "Team Allegro",
    ].join("\n\n"),
  );
});

test("and after the launch when no offer is linked", () => {
  for (const offerName of [null, undefined, "   "]) {
    const copy = LAUNCH_EMAIL.update({
      name: "Bella",
      businessName: "Bella Ltd",
      launchName: "Autumn challenge",
      offerName,
      url: LAUNCH_URL,
    });
    assert.equal(copy.subject, "Your Autumn challenge launch tracker has been updated");
    assert.match(rendered(copy), /launch tracker for Autumn challenge \(Bella Ltd\)/);
  }
});

test("the reminder on the 1st", () => {
  const copy = reportReminderCopy({
    firstName: "Ruth",
    monthLabel: "September 2026",
    reportUrl: "https://aos.allegrostrategia.com/reporting",
    second: false,
  });

  assert.equal(copy.subject, "Time to fill in your September 2026 report");
  assert.equal(
    rendered(copy),
    [
      "Ruth,",
      "Time to fill in your report for September 2026 - note that although you don't have to fill in your report, this is what is going to really help you move forward in your business so as always, I suggest doing it asap!",
      "The more data you have, the more we can use it.",
      "Anything you want to bring up, you can add to your weekly roadmap check in on Friday.",
      "Your report: https://aos.allegrostrategia.com/reporting",
      "Nina x",
    ].join("\n\n"),
  );
});

test("the reminder on the 8th", () => {
  const copy = reportReminderCopy({
    firstName: "Ruth",
    monthLabel: "September 2026",
    reportUrl: "https://aos.allegrostrategia.com/reporting",
    second: true,
  });

  assert.equal(copy.subject, "Don't forget your September 2026 report");
  assert.equal(
    rendered(copy),
    [
      "Ruth,",
      "Don't forget to fill in your monthly report for September 2026.",
      "As always, you don't have to fill this in, but I hugely suggest you do as this data is GOLDDUST for us being able to make changes together to grow your business!",
      "Your report: https://aos.allegrostrategia.com/reporting",
      "Nina x",
    ].join("\n\n"),
  );
});

test("the greeting is a first name, and never a bare comma", () => {
  assert.equal(greeting("Bella Fawkes"), "Bella,");
  assert.equal(greeting("Bella"), "Bella,");
  assert.equal(greeting("  Mary Jane Watson "), "Mary,");
  // The fallback, for a row with no name rather than a person with none.
  assert.equal(greeting(null), "Hello,");
  assert.equal(greeting(""), "Hello,");
  assert.equal(greeting("   "), "Hello,");
});

test("no em dash reaches anybody, in any of the five", () => {
  // Nina, 3 November: single dashes only. An em or en dash arrives in
  // somebody's inbox as a different character and is not how she writes.
  const all = [
    PUBLISH_EMAIL.first({ name: "Bella", businessName: "B", month: "2026-08-01", url: URL }),
    PUBLISH_EMAIL.update({ name: "Bella", businessName: "B", month: "2026-08-01", url: URL }),
    LAUNCH_EMAIL.update({
      name: "Bella",
      businessName: "B",
      launchName: "L",
      offerName: "O",
      url: LAUNCH_URL,
    }),
    reportReminderCopy({ firstName: "R", monthLabel: "September 2026", reportUrl: URL, second: false }),
    reportReminderCopy({ firstName: "R", monthLabel: "September 2026", reportUrl: URL, second: true }),
  ];

  for (const copy of all) {
    const whole = `${copy.subject}\n${rendered(copy)}`;
    assert.doesNotMatch(whole, /[—–]/, whole);
    // The greeting is its own line, and the first one.
    assert.match(rendered(copy), /^[^\n]+,\n\n/);
  }
});
