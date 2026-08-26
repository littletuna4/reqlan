// rq:["../../../reqlan rq/site/site.rq".tutorial_player_transport]
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveTransportStep,
  transportControlCopy,
  tutorialLessonHref,
  tutorialPlayerSrc,
} from "./tutorial-transport.ts";

const prevLesson = {
  slug: "gs-01-why-reqlan",
  title: "Why requirements as code",
  slideCount: 7,
};

const nextLesson = {
  slug: "gs-02-first-file",
  title: "Your first .rq file",
  slideCount: 5,
};

describe("tutorial transport step", () => {
  it("moves a slide when the player can move", () => {
    assert.deepEqual(
      resolveTransportStep("next", true, nextLesson),
      { kind: "slide", dir: "next" },
    );
    assert.deepEqual(
      resolveTransportStep("prev", true, prevLesson),
      { kind: "slide", dir: "prev" },
    );
  });

  it("opens the next lesson on slide 1 when the player cannot go forward", () => {
    assert.deepEqual(resolveTransportStep("next", false, nextLesson), {
      kind: "lesson",
      dir: "next",
      slug: nextLesson.slug,
      title: nextLesson.title,
      slide: 1,
    });
  });

  it("opens the previous lesson on its last slide when the player cannot go back", () => {
    assert.deepEqual(resolveTransportStep("prev", false, prevLesson), {
      kind: "lesson",
      dir: "prev",
      slug: prevLesson.slug,
      title: prevLesson.title,
      slide: 7,
    });
  });

  it("stays put when there is no adjacent lesson", () => {
    assert.deepEqual(resolveTransportStep("next", false, null), {
      kind: "none",
      dir: "next",
    });
    assert.deepEqual(resolveTransportStep("prev", false, null), {
      kind: "none",
      dir: "prev",
    });
  });

  it("lands on slide 1 when the previous lesson has no counted slides", () => {
    const empty = { ...prevLesson, slideCount: 0 };
    assert.equal(resolveTransportStep("prev", false, empty).kind, "lesson");
    const step = resolveTransportStep("prev", false, empty);
    assert.equal(step.kind === "lesson" ? step.slide : 0, 1);
  });
});

describe("tutorial transport copy", () => {
  it("keeps slide controls enabled and names the wrap to an adjacent lesson", () => {
    const slide = transportControlCopy(
      { kind: "slide", dir: "next" },
      "slide 3 of 7",
    );
    assert.equal(slide.disabled, false);
    assert.match(slide.aria, /Next slide/);

    const wrap = transportControlCopy(
      {
        kind: "lesson",
        dir: "next",
        slug: nextLesson.slug,
        title: nextLesson.title,
        slide: 1,
      },
      "slide 7 of 7",
    );
    assert.equal(wrap.disabled, false);
    assert.equal(wrap.aria, `Next lesson: ${nextLesson.title}`);

    const end = transportControlCopy(
      { kind: "none", dir: "next" },
      "slide 7 of 7",
    );
    assert.equal(end.disabled, true);
    assert.equal(end.tooltip, "End of deck");
  });
});

describe("tutorial transport hrefs", () => {
  it("omits slide 1 from the lesson URL and keeps later slides", () => {
    assert.equal(tutorialLessonHref("gs-02-first-file"), "/tutorials/gs-02-first-file/");
    assert.equal(
      tutorialLessonHref("gs-01-why-reqlan", 7),
      "/tutorials/gs-01-why-reqlan/?slide=7",
    );
  });

  it("builds an embed player URL for the given deck and slide", () => {
    assert.equal(
      tutorialPlayerSrc("gs-02-first-file"),
      "/presentations/player/?deck=gs-02-first-file&embed=1&slide=1",
    );
    assert.equal(
      tutorialPlayerSrc("gs-01-why-reqlan", 7),
      "/presentations/player/?deck=gs-01-why-reqlan&embed=1&slide=7",
    );
  });
});
