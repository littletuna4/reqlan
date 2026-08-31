import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { getPhonebookLink } from "../lib/phonebook.js";
import { showcaseFeatureMailto, showcases } from "./showcases/index.js";

const showcasesDir = dirname(fileURLToPath(import.meta.url)) + "/showcases";

describe("showcase list phonebook wiring", () => {
  // rq:["../../../reqlan rq/site/site.rq".showcase]
  // rq:["../../../reqlan rq/phonebook.rq".phonebook]

  it("builds a feature-request mailto from the phonebook email", () => {
    const email = getPhonebookLink("email");
    assert.ok(showcaseFeatureMailto.startsWith(email.href));
    assert.match(showcaseFeatureMailto, /subject=reqlan(\+|%20)showcase/);
  });
});

describe("broken-links showcase", () => {
  // rq:["../../../reqlan rq/site/site.rq".broken_links_showcase]
  // rq:["../../../reqlan rq/core_analysis/check.rq".check]

  it("broken-links shows reqlan check as a CI gate", () => {
    const showcase = showcases.find((item) => item.id === "broken-links");
    assert.ok(showcase);
    assert.match(showcase.summary, /reqlan check/i);
    assert.ok(showcase.tags.includes("ci"));

    const checkQueries = showcase.blocks.flatMap((block) =>
      "kind" in block && block.kind === "exchange" && block.query.includes("reqlan check")
        ? [block]
        : [],
    );
    assert.equal(checkQueries.length, 2);
    assert.match(checkQueries[0].response, /exit 1/);
    assert.match(checkQueries[1].response, /exit 0/);

    const ci = showcase.blocks.find(
      (block) => "language" in block && block.language === "yaml",
    );
    assert.ok(ci && "code" in ci);
    assert.match(ci.code, /@reqlan\/cli check/);
  });
});

describe("agent-context showcase", () => {
  // rq:["../../../reqlan rq/site/site.rq".agent_context_showcase]
  // rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]

  it("shows MCP click as the shaped context tool", () => {
    const showcase = showcases.find((item) => item.id === "agent-context");
    assert.ok(showcase);
    const click = showcase.blocks.find(
      (block) =>
        "kind" in block &&
        block.kind === "exchange" &&
        block.query.includes("click("),
    );
    assert.ok(click && "query" in click);
    assert.match(click.query, /click\(/);
    assert.doesNotMatch(click.query, /file_context/);
    assert.match(click.response, /sessionKey/);
  });
});

describe("showcase files", () => {
  // rq:["../../../reqlan rq/site/site.rq".showcase_module]
  // rq:["../../../reqlan rq/site/site.rq".showcase_set]

  it("gives each showcase its own file with rq comment references", () => {
    const files = readdirSync(showcasesDir).filter(
      (name) =>
        name.endsWith(".ts") && name !== "index.ts" && name !== "types.ts",
    );
    assert.equal(files.length, showcases.length);

    for (const file of files) {
      const source = readFileSync(join(showcasesDir, file), "utf8");
      assert.match(
        source,
        /\/\/ rq:\["\.\.\/\.\.\/\.\.\/\.\.\/reqlan rq\/site\/site\.rq"\.[a-z_]+_showcase\]/,
        `${file} must comment-link its showcase idea`,
      );
      const commentCount = [...source.matchAll(/\/\/ rq:\[/g)].length;
      assert.ok(
        commentCount >= 2,
        `${file} must also comment-link the product ideas it demonstrates`,
      );
    }
  });
});
