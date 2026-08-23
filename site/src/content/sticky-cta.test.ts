// rq:["../../../reqlan rq/site/site.rq".sticky_cta_node]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPhonebookLink } from "../lib/phonebook.js";
import { stickyCta } from "./sticky-cta.js";

describe("sticky GitHub star", () => {
  it("points the sticky star action at the phonebook GitHub link", () => {
    const github = getPhonebookLink("github");
    assert.equal(stickyCta.star.linkId, "github");
    assert.equal(getPhonebookLink(stickyCta.star.linkId).href, github.href);
  });
});
