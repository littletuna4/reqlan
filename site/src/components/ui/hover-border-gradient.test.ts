// rq:["../../../../reqlan rq/site/site.rq".get_started_cta_motion]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, "hover-border-gradient.module.css"), "utf8");
const source = readFileSync(join(dir, "hover-border-gradient.tsx"), "utf8");

describe("get-started CTA motion", () => {
  it("spins a brand-colour wash on the fill and on the border", () => {
    assert.match(css, /\.spin\s*\{[\s\S]*animation:\s*spin var\(--hbg-duration/);
    assert.match(css, /\.fillSpin\s*\{[\s\S]*animation:\s*spin var\(--hbg-duration/);
    assert.match(css, /\.fillSpin\s*\{[\s\S]*--color-aqua-bright/);
    assert.match(css, /\.fillSpin\s*\{[\s\S]*--color-rust/);
    assert.match(
      css,
      /\.inner\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--color-surface\)/,
    );
  });

  it("keeps a solid static fill when motion is reduced", () => {
    assert.match(source, /reducedMotion && styles\.innerStatic/);
    assert.match(source, /!reducedMotion \? \(/);
    assert.match(source, /styles\.fill/);
    assert.match(
      css,
      /\.innerStatic\s*\{[\s\S]*background:\s*var\(--color-surface\)/,
    );
    assert.match(
      css,
      /prefers-reduced-motion:\s*reduce[\s\S]*\.fillSpin\s*\{[\s\S]*animation:\s*none/,
    );
  });
});
