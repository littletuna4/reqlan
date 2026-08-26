// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accurateRqSnippets } from "./accurate-rq-snippets.ts";
import { rqParseError } from "./parse-rq-snippet.ts";

describe("accurate reqlan snippets", () => {
  it("collects landing and showcase .rq blocks", () => {
    const ids = accurateRqSnippets().map((snippet) => snippet.id);
    assert.ok(ids.includes("example.code"));
    assert.ok(ids.includes("hero.snippet"));
    assert.ok(ids.some((id) => id.startsWith("syntax.")));
    assert.ok(ids.some((id) => id.startsWith("showcase.")));
    // rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps]
    assert.ok(ids.some((id) => id.startsWith("first-steps.")));
  });

  for (const snippet of accurateRqSnippets()) {
    it(`${snippet.id} parses`, async () => {
      const error = await rqParseError(snippet.code);
      assert.equal(error, undefined, error);
    });
  }
});
