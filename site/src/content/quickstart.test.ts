// rq:["../../../reqlan rq/site/site.rq".quickstart_page]
// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps_page]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { firstStepsPath } from "./first-steps.ts";
import { quickstartContent } from "./quickstart.ts";

describe("quickstart what's next", () => {
  const nextSteps = quickstartContent.nextSteps;

  it("sends beginners to the first steps walkthrough first", () => {
    assert.equal(nextSteps.length, 4);
    assert.equal(nextSteps[0]?.id, "first-steps");
    assert.equal(nextSteps[0]?.href, firstStepsPath);
  });

  it("gives every step a title, detail, and site href", () => {
    const hrefs = new Set<string>();
    for (const step of nextSteps) {
      assert.ok(step.id.length > 0);
      assert.ok(step.title.trim().length > 0);
      assert.ok(step.detail.trim().length > 0);
      assert.ok(step.href.startsWith("/"), `${step.href} must be a site path`);
      assert.ok(!hrefs.has(step.href), `duplicate href ${step.href}`);
      hrefs.add(step.href);
    }
  });

  it("keeps the baseline lesson links on the tutorials route", () => {
    for (const step of nextSteps.slice(1)) {
      assert.ok(
        step.href.startsWith("/tutorials/"),
        `${step.href} must stay under /tutorials/`,
      );
    }
  });

  it("still points onward to tutorials, showcases, and faq", () => {
    const relatedIds = quickstartContent.related.map((item) => item.id);
    for (const id of ["tutorials", "showcase", "faq"]) {
      assert.ok(relatedIds.includes(id), `related must include ${id}`);
    }
  });
});
