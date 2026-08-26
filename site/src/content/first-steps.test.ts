// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps]
// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_step_order]
// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps_page]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accurateRqSnippets } from "./accurate-rq-snippets.ts";
import {
  firstStepsContent,
  firstStepsPath,
  type FirstStepsStep,
} from "./first-steps.ts";
import { rqParseError } from "./parse-rq-snippet.ts";
import { getTutorial, tutorialDecks } from "./tutorials.ts";

function assertNonEmpty(value: string, label: string): void {
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function stepLabel(step: FirstStepsStep): string {
  return `step ${step.id}`;
}

describe("first steps walkthrough", () => {
  it("lives under the tutorials route", () => {
    assert.equal(firstStepsPath, "/tutorials/first-steps");
  });

  it("keeps every baseline step in order", () => {
    const steps = firstStepsContent.steps;
    assert.ok(steps.length >= 14);
    const ids = steps.map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length, "step ids must be unique");
    for (const step of steps) {
      assertNonEmpty(step.title, `${stepLabel(step)} title`);
      assertNonEmpty(step.goal, `${stepLabel(step)} goal`);
      assertNonEmpty(step.result, `${stepLabel(step)} result`);
      assert.ok(step.actions.length > 0, `${stepLabel(step)} needs actions`);
    }
  });

  it("links every lesson to a real tutorial deck", () => {
    const slugs = new Set(tutorialDecks.map((deck) => deck.slug));
    for (const step of firstStepsContent.steps) {
      assert.ok(
        slugs.has(step.lesson.id),
        `${stepLabel(step)} lesson ${step.lesson.id} is not a known deck slug`,
      );
      assert.ok(
        getTutorial(step.lesson.id) !== undefined,
        `${stepLabel(step)} lesson must resolve through the catalog`,
      );
    }
  });

  for (const snippet of accurateRqSnippets()) {
    if (!snippet.id.startsWith("first-steps.")) {
      continue;
    }
    it(`${snippet.id} demo parses`, async () => {
      const error = await rqParseError(snippet.code);
      assert.equal(error, undefined, error);
    });
  }
});
