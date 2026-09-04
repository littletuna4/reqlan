// rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]
// rq:["../../../reqlan rq/site/site.rq".sidebar_nav]
// rq:["../../../reqlan rq/site/site.rq".nav_graph]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { elevator_pitch } from "./meta.js";
import { nav, navGraph } from "./nav.js";

describe("home Why reqlan nav", () => {
  it("points the sidebar child at the elevator pitch section", () => {
    const home = nav.find((item) => item.id === "home");
    const why = home?.children?.find(
      (child) => child.label === elevator_pitch.title,
    );
    assert.ok(why);
    assert.equal(why.id, "elevator-pitch");
  });

  it("points the page graph Why node at the elevator pitch section", () => {
    const why = navGraph.nodes.find((node) => node.label === "Why");
    assert.ok(why);
    assert.equal(why.id, "elevator-pitch");
    assert.equal(why.target, "elevator-pitch");
  });
});
