// rq:["../../../reqlan rq/site/site.rq".quiz_sticker_tab]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "QuizStickerTab.tsx"), "utf8");
const css = readFileSync(join(dir, "QuizStickerTab.module.css"), "utf8");
const home = readFileSync(join(dir, "../views/HomePage.tsx"), "utf8");
const layout = readFileSync(join(dir, "../app/layout.tsx"), "utf8");

describe("quiz sticker tab", () => {
  it("is a link to the assessment copy href", () => {
    assert.match(source, /quizStickerTab\.href/);
    assert.match(source, /sitePath\(quizStickerTab\.href\)/);
    assert.match(source, /<a className=\{styles\.cta\} href=\{sitePath\(quizStickerTab\.href\)\}>/);
    assert.doesNotMatch(source, /setTimeout|onEarned|quizDurationMs/);
  });

  it("mounts only on the home page", () => {
    assert.match(home, /<QuizStickerTab \/>/);
    assert.doesNotMatch(layout, /QuizStickerTab/);
  });

  it("uses brand colour tokens and hides on narrow viewports", () => {
    assert.match(css, /--color-rust/);
    assert.match(css, /--color-aqua/);
    assert.match(css, /min-width:\s*769px/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });

  it("does not run looping decorative motion", () => {
    assert.doesNotMatch(css, /@keyframes/);
    assert.doesNotMatch(css, /animation:/);
  });
});
