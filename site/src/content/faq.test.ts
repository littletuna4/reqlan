import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { faq } from "./faq.js";
import { nav } from "./nav.js";

describe("faq drift", () => {
  // rq:["../../../reqlan rq/site/site.rq".faq_page]
  // rq:["../../../reqlan rq/site/site.rq".faq_drift]

  it("answers how .rq files stay in sync with code", () => {
    const item = faq.items.find((entry) => entry.id === "drift");
    assert.ok(item);
    assert.match(item.question, /drifting/);
    assert.match(item.answer, /source of truth/);
    assert.match(item.answer, /rq:/);
    assert.match(item.answer, /test/);
    assert.match(item.answer, /deprecated/);
    assert.match(item.answer, /missing references/);
  });

  it("nests the drift question as a FAQ sidebar child", () => {
    const faqNav = nav.find((item) => item.id === "faq");
    assert.ok(faqNav?.children?.some((child) => child.id === "drift"));
  });
});
