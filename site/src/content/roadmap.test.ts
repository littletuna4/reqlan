// rq:["../../../reqlan rq/site/site.rq".roadmap_section]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roadmap } from "./roadmap.js";

describe("roadmap", () => {
  it("puts type system and verification on Next", () => {
    const next = roadmap.items.filter((item) => item.horizon === "Next");
    assert.deepEqual(
      next.map((item) => item.id),
      ["types"],
    );
    assert.equal(next[0]?.label, "Type system and verification");
  });

  it("keeps a single Now and demotes search/rank to Later", () => {
    const byId = Object.fromEntries(roadmap.items.map((item) => [item.id, item]));
    assert.equal(byId.context?.horizon, "Now");
    assert.equal(byId.search?.horizon, "Later");
    assert.equal(byId.rank?.horizon, "Later");
  });
});
