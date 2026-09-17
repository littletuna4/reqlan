import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { getPhonebookLink } from "../lib/phonebook.js";
import {
  isCodeBlock,
  showcaseFeatureMailto,
  showcases,
} from "./showcases/index.js";

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
  // rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_click_retrieval]

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

describe("story-codebase showcase", () => {
  // rq:["../../../reqlan rq/site/site.rq".story_codebase_showcase]
  // rq:["../../../reqlan rq/development/core.rq".code_comment_references]
  // rq:["../../../reqlan rq/development/core.rq".testing]
  // rq:["../../../reqlan rq/cli/click.rq".click]

  it("story-codebase binds a story to source and tests", () => {
    const showcase = showcases.find((item) => item.id === "story-codebase");
    assert.ok(showcase);
    assert.equal(showcase.tier, "flagship");
    assert.ok(showcase.tags.includes("story"));
    assert.match(showcase.summary, /@implementation/);
    assert.match(showcase.summary, /@tests/);

    const story = showcase.blocks.find(
      (block) => isCodeBlock(block) && block.language === "rq",
    );
    assert.ok(story && "code" in story);
    assert.match(story.code, /seat_hold/);
    assert.match(story.code, /@implementation/);
    assert.match(story.code, /@tests/);
    assert.match(story.code, /hold\.ts"\.startHold/);
    assert.match(story.code, /releases the seat after eight minutes/);

    const sources = showcase.blocks.filter(
      (block) => isCodeBlock(block) && block.language === "ts",
    );
    assert.equal(sources.length, 2);
    for (const source of sources) {
      assert.match(source.code, /rq:\[/);
      assert.match(source.code, /seat_hold/);
    }
    assert.match(sources[1].code, /releases the seat after eight minutes/);

    const click = showcase.blocks.find(
      (block) =>
        "kind" in block &&
        block.kind === "exchange" &&
        block.query.includes("click("),
    );
    assert.ok(click && "response" in click);
    assert.match(click.query, /seat_hold/);
    assert.match(click.response, /sessionKey/);
    assert.match(click.response, /seat_hold/);
    assert.match(click.response, /hold\.ts/);
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
