import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contact } from "./contact.js";

describe("contact phonebook links", () => {
  // rq:["../../../reqlan rq/site/site.rq".links]
  // rq:["../../../reqlan rq/phonebook.rq".show_in_footer]

  it("omits links that opt out of the footer", () => {
    assert.ok(!contact.links.some((link) => link.id === "sticker-form"));
    assert.ok(contact.links.some((link) => link.id === "github"));
  });
});
