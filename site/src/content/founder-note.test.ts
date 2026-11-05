// rq:["../../../reqlan rq/site/site.rq".founder_note_section]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { founderNote } from "./founder-note.js";

describe("founder note", () => {
  it("shows a real headshot with descriptive alt text", () => {
    assert.equal(founderNote.photo.src, "/people/tony-cerqui.webp");
    assert.match(founderNote.photo.alt, /Tony Cerqui/);
  });

  it("keeps the note short and signed", () => {
    assert.ok(founderNote.quote.length <= 2);
    assert.equal(founderNote.name, "Tony Cerqui");
  });

  it("gives visitors a way to reach the maker", () => {
    const ids = founderNote.links.map((link) => link.id);
    assert.deepEqual(ids, ["issues", "email", "site"]);
    assert.equal(
      founderNote.links[0]?.href,
      "https://github.com/littletuna4/reqlan/issues",
    );
    assert.match(founderNote.links[1]?.href ?? "", /^mailto:/);
  });
});
