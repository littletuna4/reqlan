// rq:["../../../reqlan rq/site/site.rq".example_section]
// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { example } from "./example.ts";
import { rqParseError } from "./parse-rq-snippet.ts";

describe("example.code", () => {
  it("parses as valid reqlan", async () => {
    const error = await rqParseError(example.code);
    assert.equal(error, undefined, error);
  });
});
