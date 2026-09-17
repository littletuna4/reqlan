// rq:["../../../reqlan rq/site/site.rq".meta_tags]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { pages } from "../content/meta.js";
import { getPhonebookLink } from "./phonebook.js";
import {
  canonicalPath,
  pageMetadata,
  rootMetadata,
  siteMetadataBase,
} from "./site-metadata.js";

const dir = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(dir, "../..");

describe("site metadata", () => {
  it("uses the phonebook site href as metadataBase", () => {
    const site = getPhonebookLink("site");
    assert.equal(siteMetadataBase().href, new URL(site.href).href);
    assert.equal(rootMetadata().metadataBase?.href, siteMetadataBase().href);
  });

  it("sets shared title template, Open Graph image, and Twitter card", () => {
    const metadata = rootMetadata();
    const title = metadata.title;
    assert.ok(title && typeof title === "object" && "template" in title);
    assert.equal(title.default, "reqlan");
    assert.equal(title.template, "%s · reqlan");
    assert.equal(metadata.openGraph?.type, "website");
    const images = metadata.openGraph?.images;
    assert.ok(Array.isArray(images));
    const image = images[0];
    assert.ok(image && typeof image === "object" && "url" in image);
    assert.equal(image.url, "/og.png");
    assert.equal(metadata.twitter?.card, "summary_large_image");
    assert.equal(metadata.themeColor, "#0371c1");
  });

  it("adds trailing slashes to canonical paths", () => {
    assert.equal(canonicalPath("/"), "/");
    assert.equal(canonicalPath("/faq"), "/faq/");
    assert.equal(canonicalPath("/faq/"), "/faq/");
    assert.equal(canonicalPath("tutorials"), "/tutorials/");
  });

  it("sets page title, description, canonical, and social tags", () => {
    const metadata = pageMetadata({
      title: pages.showcase.title,
      description: pages.showcase.description,
      path: "/showcase",
    });
    assert.equal(metadata.title, "Showcases");
    assert.equal(metadata.description, pages.showcase.description);
    assert.equal(metadata.alternates?.canonical, "/showcase/");
    assert.equal(metadata.openGraph?.url, "/showcase/");
    assert.equal(metadata.twitter?.title, "Showcases");
    assert.deepEqual(metadata.robots, { index: true, follow: true });
  });

  it("does not index the presentation player", () => {
    const metadata = pageMetadata({
      title: pages.player.title,
      description: pages.player.description,
      path: "/presentations/player/",
      index: false,
    });
    assert.deepEqual(metadata.robots, { index: false, follow: false });
  });

  it("keeps the Open Graph image generator and layout wired", () => {
    const layout = readFileSync(join(dir, "../app/layout.tsx"), "utf8");
    const images = readFileSync(
      join(siteRoot, "scripts/generate-images.mjs"),
      "utf8",
    );
    assert.match(layout, /rootMetadata\(\)/);
    assert.match(images, /og\.png/);
    assert.match(images, /1200/);
    assert.match(images, /630/);
  });
});
