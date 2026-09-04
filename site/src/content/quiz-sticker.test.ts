// rq:["../../../reqlan rq/site/site.rq".quiz_sticker_tab]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessments } from "./assessment.js";
import { assessmentsEntryPath } from "../lib/certs-paths.js";
import { getPhonebookLink } from "../lib/phonebook.js";
import { quizStickerTab } from "./quiz-sticker.js";

describe("quiz sticker tab copy", () => {
  it("links the CTA to the assessment entry path", () => {
    assert.equal(quizStickerTab.href, assessmentsEntryPath(assessments));
  });

  it("uses the phonebook sticker-form icon", () => {
    const sticker = getPhonebookLink("sticker-form");
    assert.equal(quizStickerTab.iconLinkId, "sticker-form");
    assert.equal(getPhonebookLink(quizStickerTab.iconLinkId).href, sticker.href);
  });
});
