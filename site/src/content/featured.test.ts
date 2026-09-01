// rq:["../../../reqlan rq/site/site.rq".featured_in_section]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { featured } from "./featured.js";

describe("featured in", () => {
  it("lists the three social-proof catalogues", () => {
    assert.equal(featured.title, "Featured in");
    assert.equal(featured.items.length, 3);

    const byId = Object.fromEntries(
      featured.items.map((item) => [item.id, item]),
    );

    assert.equal(
      byId.agentlanguages?.href,
      "https://agentlanguages.dev/languages/reqlan/",
    );
    assert.equal(byId.agentlanguages?.label, "agentlanguages.dev");

    assert.equal(
      byId["awesome-sdd"]?.href,
      "https://github.com/Engineering4AI/awesome-spec-driven-development",
    );
    assert.equal(
      byId["awesome-sdd"]?.label,
      "awesome-spec-driven-development",
    );

    assert.equal(
      byId["awesome-docs"]?.href,
      "https://github.com/testthedocs/awesome-docs",
    );
    assert.equal(byId["awesome-docs"]?.label, "awesome-docs");
  });

  it("keeps every listing as an absolute https URL", () => {
    for (const item of featured.items) {
      assert.match(item.href, /^https:\/\//);
    }
  });
});
