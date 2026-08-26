// rq:["../../../reqlan rq/site/site.rq".tutorial_player_transport]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "TutorialPlayerShell.tsx"), "utf8");
const css = readFileSync(join(dir, "TutorialPlayerShell.module.css"), "utf8");

describe("tutorial player transport", () => {
  it("lets < and > wrap to an adjacent lesson when the slide cannot move", () => {
    assert.match(source, /goTransport\("prev"\)/);
    assert.match(source, /goTransport\("next"\)/);
    assert.match(source, /resolveTransportStep/);
    assert.match(source, /disabled=\{prevCopy\.disabled\}/);
    assert.match(source, /disabled=\{nextCopy\.disabled\}/);
    assert.doesNotMatch(source, /disabled=\{!meta\.canPrev\}/);
    assert.doesNotMatch(source, /disabled=\{!meta\.canNext\}/);
  });

  it("prefetches the next lesson page and preloads its player after the current deck is ready", () => {
    assert.match(source, /rel="prefetch"/);
    assert.match(source, /nextLessonHref/);
    assert.match(source, /currentReady && next && nextPlayerSrc/);
    assert.match(source, /styles\.preloadFrame/);
    assert.match(source, /event\.source !== playerWindow/);
    assert.match(css, /\.preloadFrame\s*\{/);
    assert.match(css, /clip-path:\s*inset\(50%\)/);
  });
});
