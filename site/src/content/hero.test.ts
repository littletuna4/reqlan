// rq:["../../../reqlan rq/site/site.rq".hero_github_star]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPhonebookLink } from "../lib/phonebook.js";
import { starCta } from "./hero.js";

describe("hero GitHub star", () => {
  it("points the hero star control at the phonebook GitHub link", () => {
    const github = getPhonebookLink("github");
    assert.equal(starCta.linkId, "github");
    assert.equal(starCta.label, "Star on GitHub");
    assert.equal(getPhonebookLink(starCta.linkId).href, github.href);
  });
});
