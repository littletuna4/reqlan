// rq:["../../../reqlan rq/site/site.rq".roadmap_section]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fileSpecHref,
  folderSpecHref,
  ideaSpecHref,
  slugifySpec,
} from "./spec-path.js";

describe("spec-path", () => {
  it("slugifies like the HTML export", () => {
    assert.equal(slugifySpec("reqlan rq/ingest/type-system.rq"), "reqlan-rq-ingest-type-system-rq");
    assert.equal(slugifySpec("context_scope_v2"), "context-scope-v2");
  });

  it("builds idea, file, and folder hrefs", () => {
    assert.equal(
      ideaSpecHref("reqlan rq/ingest/type-system.rq", "typed-reqlan"),
      "/spec/ideas/typed-reqlan--reqlan-rq-ingest-type-system-rq-typed-reqlan.html",
    );
    assert.equal(
      fileSpecHref("reqlan rq/ingest/type-system.rq"),
      "/spec/files/reqlan-rq-ingest-type-system-rq.html",
    );
    assert.equal(
      folderSpecHref("reqlan rq/ingest"),
      "/spec/folders/reqlan-rq-ingest.html",
    );
  });
});
