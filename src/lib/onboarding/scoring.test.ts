import assert from "node:assert/strict";
import { test } from "node:test";

import { AUDIT_QUESTIONS, scoreAudit } from "./audit-questions.ts";

test("every question's options are scored 0–3 and unique", () => {
  for (const question of AUDIT_QUESTIONS) {
    const scores = question.options.map((o) => o.score);
    assert.deepEqual(
      [...scores].sort(),
      [0, 1, 2, 3],
      `${question.id} should offer one option at each score`,
    );
    const values = new Set(question.options.map((o) => o.value));
    assert.equal(values.size, question.options.length, `${question.id} has duplicate values`);
  }
});

test("question ids are unique — they key the stored answers", () => {
  const ids = new Set(AUDIT_QUESTIONS.map((q) => q.id));
  assert.equal(ids.size, AUDIT_QUESTIONS.length);
});

test("the weakest station is the LOWEST score, not the highest", () => {
  // Strong everywhere except Banco Allegro, which is answered at the floor.
  const answers: Record<string, string> = {};
  for (const q of AUDIT_QUESTIONS) {
    answers[q.id] = q.options.find((o) => o.score === 3)!.value;
  }
  answers.money = AUDIT_QUESTIONS.find((q) => q.id === "money")!.options.find(
    (o) => o.score === 0,
  )!.value;

  const result = scoreAudit(answers);
  assert.equal(result.weakestStationSlug, "banco-allegro");
});

test("unanswered questions are skipped, not counted as zero", () => {
  // Only one question answered, at the floor. No other station should appear —
  // otherwise an abandoned form would elect a weakest station by silence.
  const result = scoreAudit({ money: "never" });

  assert.deepEqual(Object.keys(result.scores.station), ["banco-allegro"]);
  assert.equal(result.weakestStationSlug, "banco-allegro");
});

test("buckets are averaged, so bucket size doesn't decide the winner", () => {
  // 'profit' holds three questions, 'launch' two. Answer every profit question
  // at 2 and every launch question at 1: a sum would call profit weaker (6 vs
  // 2), an average correctly calls launch weaker.
  const answers: Record<string, string> = {};
  for (const q of AUDIT_QUESTIONS) {
    const target = q.bucket === "profit" ? 2 : q.bucket === "launch" ? 1 : null;
    if (target === null) continue;
    answers[q.id] = q.options.find((o) => o.score === target)!.value;
  }

  const result = scoreAudit(answers);
  assert.equal(result.scores.bucket.profit, 2);
  assert.equal(result.scores.bucket.launch, 1);
  assert.equal(result.weakestBucket, "launch");
});

test("an empty audit produces no diagnosis rather than a false one", () => {
  const result = scoreAudit({});
  assert.equal(result.weakestStationSlug, null);
  assert.equal(result.weakestBucket, null);
});

test("unknown answer values are ignored", () => {
  const result = scoreAudit({ money: "not-an-option" });
  assert.deepEqual(result.scores.station, {});
  assert.equal(result.weakestStationSlug, null);
});
