import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PASS_RATIO,
  assessmentQuestions,
  scoreAssessment,
} from "../content/assessment.js";

function correctAnswers(): Record<string, string> {
  return Object.fromEntries(
    assessmentQuestions.map((q) => [q.id, q.correctChoiceId]),
  );
}

describe("scoreAssessment", () => {
  it("passes a perfect score", () => {
    const score = scoreAssessment(correctAnswers());
    assert.equal(score.correct, assessmentQuestions.length);
    assert.equal(score.total, assessmentQuestions.length);
    assert.equal(score.passed, true);
    assert.equal(score.ratio, 1);
  });

  it("fails below the pass ratio", () => {
    const answers = correctAnswers();
    // 5/8 = 0.625 < 0.8
    const wrongIds = assessmentQuestions.slice(0, 3).map((q) => q.id);
    for (const id of wrongIds) {
      answers[id] = "__wrong__";
    }
    const score = scoreAssessment(answers);
    assert.equal(score.correct, 5);
    assert.equal(score.passed, false);
    assert.ok(score.ratio < PASS_RATIO);
  });

  it("passes at exactly the pass boundary when ratio allows", () => {
    // 7/8 = 0.875 >= 0.8
    const answers = correctAnswers();
    answers[assessmentQuestions[0]!.id] = "__wrong__";
    const score = scoreAssessment(answers);
    assert.equal(score.correct, 7);
    assert.equal(score.passed, true);
    assert.ok(score.ratio >= PASS_RATIO);
  });

  it("treats unanswered questions as incorrect", () => {
    const score = scoreAssessment({});
    assert.equal(score.correct, 0);
    assert.equal(score.passed, false);
  });
});
