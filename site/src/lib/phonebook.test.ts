import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPhonebookLink,
  isShownInFooter,
  phonebookFooterLinks,
  phonebookLinks,
} from "./phonebook.js";

describe("phonebook footer flag", () => {
  // rq:["../../../reqlan rq/phonebook.rq".show_in_footer]
  // rq:["../../../reqlan rq/site/site.rq".footer]

  it("treats omitted show-in-footer as true", () => {
    const github = getPhonebookLink("github");
    assert.equal(github["show-in-footer"], undefined);
    assert.equal(isShownInFooter(github), true);
    assert.ok(phonebookFooterLinks.some((link) => link.id === "github"));
  });

  it("opts a link out of the footer when show-in-footer is false", () => {
    const sticker = getPhonebookLink("sticker-form");
    assert.equal(sticker["show-in-footer"], false);
    assert.equal(isShownInFooter(sticker), false);
    assert.ok(phonebookLinks.some((link) => link.id === "sticker-form"));
    assert.ok(!phonebookFooterLinks.some((link) => link.id === "sticker-form"));
  });
});
