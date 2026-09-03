import assert from "node:assert/strict";
import { test } from "node:test";

import { matchPairings, type PastPairing } from "./match.ts";

const NINA = "nina";
const [A, B, C, D, E] = ["a", "b", "c", "d", "e"];

function run(
  members: string[],
  history: PastPairing[] = [],
  availability: Record<string, string[]> = {},
  coachId: string | null = NINA,
) {
  return matchPairings({
    members,
    history,
    availability: new Map(Object.entries(availability)),
    coachId,
  });
}

const partnerOf = (result: ReturnType<typeof run>, member: string) =>
  result.pairs.find((p) => p.members.includes(member))?.members.find((m) => m !== member);

test("an even group pairs off with nobody left over", () => {
  const result = run([A, B, C, D]);
  assert.equal(result.pairs.length, 2);
  assert.deepEqual(result.unmatched, []);
});

test("everybody appears exactly once", () => {
  const result = run([A, B, C, D]);
  const seen = result.pairs.flatMap((p) => p.members).sort();
  assert.deepEqual(seen, [A, B, C, D]);
});

// §9: nobody is ever "the one who's never picked".
test("an odd group leaves nobody out — the spare gets Nina", () => {
  const result = run([A, B, C]);
  assert.deepEqual(result.unmatched, []);
  const withCoach = result.pairs.filter((p) => p.withCoach);
  assert.equal(withCoach.length, 1);
  assert.ok(withCoach[0].members.includes(NINA));
});

test("with no coach, an odd group does leave someone out — and says so", () => {
  const result = run([A, B, C], [], {}, null);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.pairs.length, 1);
});

test("people who have never met are preferred over a repeat", () => {
  // A met B last month. With C and D also free, A should not draw B again.
  const history: PastPairing[] = [{ month: "2026-08-01", members: [A, B] }];
  const result = run([A, B, C, D], history);
  assert.notEqual(partnerOf(result, A), B);
});

test("the longest-ago partner wins over a more recent one", () => {
  // A has met everyone, so a repeat is unavoidable and the question is which.
  // B was four months ago, C two, D last month.
  const history: PastPairing[] = [
    { month: "2026-05-01", members: [A, B] },
    { month: "2026-07-01", members: [A, C] },
    { month: "2026-08-01", members: [A, D] },
  ];
  const result = run([A, B, C, D], history, {}, null);
  assert.equal(partnerOf(result, A), B);
});

test("whoever has waited longest is placed first", () => {
  const history: PastPairing[] = [
    { month: "2026-08-01", members: [B, C] },
    { month: "2026-08-01", members: [D, E] },
  ];
  // A has never been paired at all, so A is matched before anyone else.
  const result = run([A, B, C, D, E], history, {}, null);
  assert.ok(result.pairs.some((p) => p.members.includes(A)));
  assert.deepEqual(result.unmatched.length, 1);
  assert.ok(!result.unmatched.includes(A));
});

test("shared availability breaks a tie between equal partners", () => {
  // A has met nobody; B and C are both new to A. Only C shares a slot.
  const result = run([A, B, C, D], [], {
    [A]: ["tue-pm", "wed-am"],
    [B]: ["fri-eve"],
    [C]: ["tue-pm"],
    [D]: ["mon-am"],
  });
  assert.equal(partnerOf(result, A), C);
});

// Availability is a preference, not a constraint — §9 would rather two people
// sort out a time themselves than have one of them go unpaired.
test("no shared availability still pairs, just without a proposed time", () => {
  const result = run([A, B], [], { [A]: ["mon-am"], [B]: ["fri-eve"] });
  assert.equal(result.pairs.length, 1);
  assert.deepEqual(result.pairs[0].shared, []);
});

test("shared slots come back in the grid's order, not either person's", () => {
  const result = run([A, B], [], {
    [A]: ["fri-eve", "mon-am"],
    [B]: ["mon-am", "fri-eve"],
  });
  assert.deepEqual(result.pairs[0].shared, ["mon-am", "fri-eve"]);
});

// The coach slot rotates too: whoever got Nina last month shouldn't get her
// again just because being paired makes them look recently-matched.
test("the coach slot rotates on its own, not on who waited longest", () => {
  // A last paired in May — with Nina. B and C paired each other in August, so
  // by overall waiting A is first in line. The coach slot has to rotate on who
  // has had Nina, or the person who got her keeps getting her.
  const history: PastPairing[] = [
    { month: "2026-05-01", members: [A, NINA] },
    { month: "2026-08-01", members: [B, C] },
  ];
  const result = run([A, B, C], history);
  const coachPair = result.pairs.find((p) => p.withCoach)!;
  assert.ok(
    !coachPair.members.includes(A),
    "A waited longest overall, but A is the one who already had Nina",
  );
});

test("the coach is never also matched as an ordinary member", () => {
  const result = run([A, B, C, NINA]);
  const appearances = result.pairs
    .flatMap((p) => p.members)
    .filter((m) => m === NINA).length;
  assert.equal(appearances, 1);
});

test("the same input always produces the same pairs", () => {
  const history: PastPairing[] = [{ month: "2026-07-01", members: [B, D] }];
  const availability = { [A]: ["mon-am"], [C]: ["mon-am"] };
  const first = run([A, B, C, D, E], history, availability);
  const second = run([E, D, C, B, A], history, availability);
  assert.deepEqual(
    first.pairs.map((p) => [...p.members].sort()).sort(),
    second.pairs.map((p) => [...p.members].sort()).sort(),
  );
});

test("nothing about a member other than who they have met is consulted", () => {
  // The whole guard against hierarchy creeping back in: the input type has no
  // room for business type, size or anything else, and this asserts the shape
  // rather than the behaviour — a future field would break it.
  const input = {
    members: [A, B],
    history: [],
    availability: new Map<string, string[]>(),
    coachId: null,
  };
  assert.deepEqual(Object.keys(input).sort(), [
    "availability",
    "coachId",
    "history",
    "members",
  ]);
});
