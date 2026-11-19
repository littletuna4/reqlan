// rq:["../../../reqlan rq/site/site.rq".roadmap_section]
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { roadmap } from "./roadmap.js";

const workspaceRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const exportedSpec = resolve("/tmp/roadmap-spec-check/out/spec");

describe("roadmap", () => {
  it("puts type system and verification on Next", () => {
    const next = roadmap.items.filter((item) => item.horizon === "Next");
    assert.deepEqual(
      next.map((item) => item.id),
      ["types"],
    );
    assert.equal(next[0]?.label, "Type system and verification");
  });

  it("marks shipped search as Done and keeps Now on context", () => {
    const byId = Object.fromEntries(roadmap.items.map((item) => [item.id, item]));
    assert.equal(byId.context?.horizon, "Now");
    assert.equal(byId.search?.horizon, "Done");
    assert.equal(byId.rank?.horizon, "Later");
  });

  it("gives every item at least one /spec link", () => {
    for (const item of roadmap.items) {
      assert.ok(item.spec.length > 0, `${item.id} needs spec links`);
      for (const link of item.spec) {
        assert.match(link.href, /^\/spec\/(ideas|files|folders)\//);
        assert.match(link.href, /\.html$/);
      }
    }
  });

  it("resolves idea and file links against an exported spec when present", async () => {
    try {
      await access(exportedSpec);
    } catch {
      return;
    }

    for (const item of roadmap.items) {
      for (const link of item.spec) {
        if (link.href.startsWith("/spec/folders/")) {
          continue;
        }
        const relative = link.href.replace(/^\/spec\//, "");
        await access(resolve(exportedSpec, relative));
      }
    }

    // Workspace paths used in href builders must still exist as source.
    await access(resolve(workspaceRoot, "reqlan rq/ingest/type-system.rq"));
  });
});
