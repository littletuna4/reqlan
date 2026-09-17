// rq:["../../../reqlan rq/site/site.rq".meta_tags]
// rq:["../../../reqlan rq/site/site.rq".copy]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { meta, pages } from "./meta.js";

const dir = dirname(fileURLToPath(import.meta.url));

describe("site meta copy", () => {
  it("defines a 1200×630 Open Graph image", () => {
    assert.equal(meta.ogImage.path, "/og.png");
    assert.equal(meta.ogImage.width, 1200);
    assert.equal(meta.ogImage.height, 630);
    assert.equal(meta.ogImage.alt, meta.title);
  });

  it("keeps route titles free of the document-title suffix", () => {
    for (const page of Object.values(pages)) {
      assert.equal(page.title.includes("·"), false);
    }
  });

  it("keeps the Open Graph tagline in the image generator", () => {
    const images = readFileSync(
      join(dir, "../../scripts/generate-images.mjs"),
      "utf8",
    );
    assert.equal(images.includes(meta.ogImage.tagline), true);
  });

  it("ships the Open Graph PNG", () => {
    const png = readFileSync(join(dir, "../../public/og.png"));
    assert.ok(png.byteLength > 0);
  });
});
