// rq:["../../../reqlan rq/site/site.rq".hero_github_star]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "HeroActions.tsx"), "utf8");
const css = readFileSync(join(dir, "HeroActions.module.css"), "utf8");

describe("hero action row GitHub star", () => {
  it("renders Star on GitHub in the hero action row", () => {
    assert.match(source, /styles\.row/);
    assert.match(source, /starCta/);
    assert.match(source, /getPhonebookLink\(starCta\.linkId\)/);
    assert.match(source, /target="_blank"/);
    assert.match(css, /\.star\s*\{/);
  });
});
