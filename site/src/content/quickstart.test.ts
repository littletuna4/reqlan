// rq:["../../../reqlan rq/site/site.rq".quickstart_page]
//rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { quickstartContent } from "./quickstart.ts";

describe("quickstart what's next", () => {
  const nextSteps = quickstartContent.nextSteps;

  it("sends beginners to the get-started decks first", () => {
    assert.equal(nextSteps.length, 4);
    assert.equal(nextSteps[0]?.id, "why-reqlan");
    assert.equal(nextSteps[0]?.href, "/tutorials/gs-01-why-reqlan");
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

  it("documents click as the MCP retrieval tool", () => {
    const mcp = quickstartContent.packages.find((item) => item.id === "mcp");
    assert.ok(mcp);
    assert.match(mcp.steps.join("\n"), /click/i);
    assert.match(mcp.tips.join("\n"), /`click`/);
    assert.doesNotMatch(mcp.tips.join("\n"), /search_requirements/);
    assert.doesNotMatch(mcp.tips.join("\n"), /file_context/);
  });
});
