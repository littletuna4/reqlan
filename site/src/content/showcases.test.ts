import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPhonebookLink } from "../lib/phonebook.js";
import { showcaseFeatureMailto } from "./showcases.js";

describe("showcase list phonebook wiring", () => {
  // rq:["../../../reqlan rq/site/site.rq".showcase]
  // rq:["../../../reqlan rq/phonebook.rq".phonebook]

  it("builds a feature-request mailto from the phonebook email", () => {
    const email = getPhonebookLink("email");
    assert.ok(showcaseFeatureMailto.startsWith(email.href));
    assert.match(showcaseFeatureMailto, /subject=reqlan(\+|%20)showcase/);
  });
});
