import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CORE_ASSESSMENT_ID,
  PASS_RATIO,
  assessmentQuestions,
  assessments,
  getAssessment,
  isAssessmentId,
  scoreAssessment,
  type Assessment,
} from "../content/assessment.js";

const SECTION_IDS = [
  "ontology",
  "installation",
  "syntax",
  "graph",
  "cli",
] as const;

function correctAnswers(assessment: Assessment): Record<string, string> {
  return Object.fromEntries(
    assessmentQuestions(assessment).map((q) => [q.id, q.correctChoiceId]),
  );
}

function minCorrectToPass(total: number, passRatio: number): number {
  return Math.ceil(passRatio * total - Number.EPSILON);
}

describe("assessments catalog", () => {
  it("ships one core assessment", () => {
    assert.equal(assessments.length, 1);
    assert.equal(assessments[0]!.id, CORE_ASSESSMENT_ID);
    assert.equal(isAssessmentId(CORE_ASSESSMENT_ID), true);
    assert.ok(getAssessment(CORE_ASSESSMENT_ID));
  });

  it("uses URL-safe ids", () => {
    for (const assessment of assessments) {
      assert.match(assessment.id, /^[a-z][a-z0-9-]*$/);
    }
  });

  it("groups questions into the five sections", () => {
    const assessment = assessments[0]!;
    assert.deepEqual(
      assessment.sections.map((section) => section.id),
      [...SECTION_IDS],
    );
    assert.ok(assessmentQuestions(assessment).length >= 10);
    for (const section of assessment.sections) {
      assert.ok(section.questions.length >= 2);
    }
  });

  it("covers advanced language features and check", () => {
    const ids = new Set(
      assessmentQuestions(assessments[0]!).map((question) => question.id),
    );
    for (const id of [
      "syntax-import",
      "syntax-file-ref",
      "syntax-wildcard",
      "syntax-comment-ref",
      "cli-check",
    ]) {
      assert.equal(ids.has(id), true, `missing question ${id}`);
    }
  });

  it("gives each question a unique id and a real correct choice", () => {
    const seen = new Set<string>();
    for (const assessment of assessments) {
      for (const question of assessmentQuestions(assessment)) {
        assert.equal(seen.has(question.id), false);
        seen.add(question.id);
        const choiceIds = question.choices.map((choice) => choice.id);
        assert.equal(new Set(choiceIds).size, choiceIds.length);
        assert.ok(choiceIds.includes(question.correctChoiceId));
      }
    }
  });

  it("returns undefined for an unknown id", () => {
    assert.equal(getAssessment("not-a-quiz"), undefined);
    assert.equal(isAssessmentId("not-a-quiz"), false);
  });
});

describe("scoreAssessment", () => {
  const assessment = assessments[0]!;
  const questions = assessmentQuestions(assessment);
  const passAt = minCorrectToPass(questions.length, PASS_RATIO);

  it("passes a perfect score", () => {
    const score = scoreAssessment(correctAnswers(assessment), questions);
    assert.equal(score.correct, questions.length);
    assert.equal(score.total, questions.length);
    assert.equal(score.passed, true);
    assert.equal(score.ratio, 1);
  });

  it("passes at the pass boundary", () => {
    const answers = correctAnswers(assessment);
    const wrongCount = questions.length - passAt;
    const wrongIds = questions.slice(0, wrongCount).map((q) => q.id);
    for (const id of wrongIds) {
      answers[id] = "__wrong__";
    }
    const score = scoreAssessment(answers, questions);
    assert.equal(score.correct, passAt);
    assert.equal(score.passed, true);
    assert.ok(score.ratio >= PASS_RATIO);
  });

  it("fails just below the pass boundary", () => {
    const answers = correctAnswers(assessment);
    const wrongCount = questions.length - passAt + 1;
    const wrongIds = questions.slice(0, wrongCount).map((q) => q.id);
    for (const id of wrongIds) {
      answers[id] = "__wrong__";
    }
    const score = scoreAssessment(answers, questions);
    assert.equal(score.correct, passAt - 1);
    assert.equal(score.passed, false);
    assert.ok(score.ratio < PASS_RATIO);
  });

  it("treats unanswered questions as incorrect", () => {
    const score = scoreAssessment({}, questions);
    assert.equal(score.correct, 0);
    assert.equal(score.passed, false);
  });
});
