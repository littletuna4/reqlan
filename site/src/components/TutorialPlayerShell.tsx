"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { parseAsInteger, useQueryState } from "nuqs";

import type { TutorialDeck, TutorialNeighbors, TutorialSeries } from "@/content/tutorial-model";
import { sitePath } from "@/lib/paths";
import {
  completionGlyph,
  completionLabel,
  type CompletionState,
} from "@/lib/tutorial-progress";
import { useTutorialProgress } from "@/lib/use-tutorial-progress";
import styles from "./TutorialPlayerShell.module.css";

const MSG_SOURCE = "reqlan-tutorial";

const slideParser = parseAsInteger.withDefault(1).withOptions({
  history: "replace",
  clearOnDefault: true,
  shallow: true,
});

type SlideMeta = {
  total: number;
  canPrev: boolean;
  canNext: boolean;
};

export type TutorialCoursePeer = {
  series: TutorialSeries;
  title: string;
  slug: string;
};

type TutorialPlayerShellProps = {
  tutorial: TutorialDeck;
  neighbors: TutorialNeighbors;
  seriesTitle: string;
  courses: TutorialCoursePeer[];
};

export function TutorialPlayerShell({
  tutorial,
  neighbors,
  seriesTitle,
  courses,
}: TutorialPlayerShellProps) {
  const { prev, next, seriesTotal, seriesDecks } = neighbors;
  const {
    getCourseState,
    getLessonState,
    isSlideComplete,
    toggleCourse,
    toggleLesson,
    toggleSlide,
    markSlideComplete,
  } = useTutorialProgress();
  const seriesLessonInputs = seriesDecks.map((deck) => ({
    id: deck.id,
    slideCount: deck.slideCount,
  }));
  const progressUnits = seriesDecks.reduce((sum, deck) => {
    const state = getLessonState(deck.id, deck.slideCount);
    if (state === "complete") return sum + 1;
    if (state === "partial") return sum + 0.5;
    return sum;
  }, 0);
  const progressPct =
    seriesTotal <= 0 ? 0 : (progressUnits / seriesTotal) * 100;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const applyingFromPlayer = useRef(false);
  const skipGoto = useRef(true);
  const tutorialIdRef = useRef(tutorial.id);
  const [slide, setSlide] = useQueryState("slide", slideParser);
  const [meta, setMeta] = useState<SlideMeta>({
    total: 0,
    canPrev: false,
    canNext: true,
  });
  /** null = show the current lesson; otherwise the hovered/focused step */
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const labelId = hoveredId ?? tutorial.id;
  const labelMode = hoveredId ? "hover" : "current";
  const labelDeck =
    seriesDecks.find((deck) => deck.id === labelId) ?? tutorial;

  const clearHover = useCallback(() => {
    setHoveredId(null);
  }, []);

  const postToPlayer = useCallback((payload: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: MSG_SOURCE, ...payload }, window.location.origin);
  }, []);

  const postNav = useCallback(
    (dir: "prev" | "next") => {
      postToPlayer({ type: "nav", dir });
    },
    [postToPlayer],
  );

  // Stable iframe src for this lesson — include initial slide once so deep links open correctly.
  const playerSrc = useMemo(() => {
    const params = new URLSearchParams({
      deck: tutorial.id,
      embed: "1",
      slide: String(Math.max(1, slide)),
    });
    return sitePath(`/presentations/player/?${params.toString()}`);
    // Only remount when the lesson changes; slide updates go via postMessage.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: initial slide only
  }, [tutorial.id]);

  useEffect(() => {
    if (tutorialIdRef.current === tutorial.id) return;
    tutorialIdRef.current = tutorial.id;
    setHoveredId(null);
    skipGoto.current = true;
    void setSlide(1);
    setMeta({ total: 0, canPrev: false, canNext: true });
  }, [tutorial.id, setSlide]);

  useEffect(() => {
    if (slide >= 1) markSlideComplete(tutorial.id, slide);
  }, [tutorial.id, slide, markSlideComplete]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== MSG_SOURCE) return;
      if (data.type === "state") {
        const index0 = Number(data.index) || 0;
        const nextSlide = index0 + 1;
        setMeta({
          total: Number(data.total) || 0,
          canPrev: Boolean(data.canPrev),
          canNext: Boolean(data.canNext),
        });
        if (nextSlide !== slide) {
          applyingFromPlayer.current = true;
          void setSlide(nextSlide);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSlide, slide]);

  // Browser back/forward: drive the iframe to the URL slide (skip first paint — src already has it).
  useEffect(() => {
    if (skipGoto.current) {
      skipGoto.current = false;
      return;
    }
    if (applyingFromPlayer.current) {
      applyingFromPlayer.current = false;
      return;
    }
    postToPlayer({ type: "goto", index: Math.max(0, slide - 1) });
  }, [slide, postToPlayer]);

  const onStepBlur = (event: FocusEvent<HTMLAnchorElement>) => {
    const related = event.relatedTarget;
    if (related instanceof Node && stepsRef.current?.contains(related)) {
      return;
    }
    clearHover();
  };

  const onChromeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLAnchorElement) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (event.shiftKey) {
        if (prev) window.location.href = sitePath(`/tutorials/${prev.slug}/`);
      } else if (meta.canPrev) {
        postNav("prev");
      }
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (event.shiftKey) {
        if (next) window.location.href = sitePath(`/tutorials/${next.slug}/`);
      } else if (meta.canNext) {
        postNav("next");
      }
    }
  };

  const slideLabel =
    meta.total > 0 ? `slide ${slide} of ${meta.total}` : "slides";
  const slideValue =
    meta.total > 0 ? `${slide}/${meta.total}` : "…";
  const lessonOrder = String(tutorial.order).padStart(2, "0");
  const lessonSlideCount =
    meta.total > 0 ? meta.total : tutorial.slideCount;
  const courseDone = getCourseState(tutorial.series, seriesLessonInputs);
  const lessonDone = getLessonState(tutorial.id, lessonSlideCount);
  const slideDone: CompletionState = isSlideComplete(tutorial.id, slide)
    ? "complete"
    : "none";
  const completedLessonCount = seriesDecks.filter(
    (deck) => getLessonState(deck.id, deck.slideCount) === "complete",
  ).length;

  const coursePeers = useMemo(
    () =>
      courses.map((course) => ({
        series: course.series,
        title: course.title,
        href: sitePath(`/tutorials/${course.slug}/`),
        current: course.series === tutorial.series,
      })),
    [courses, tutorial.series],
  );

  const lessonPeers = useMemo(
    () =>
      seriesDecks.map((deck) => ({
        id: deck.id,
        order: deck.order,
        title: deck.title,
        href: sitePath(`/tutorials/${deck.slug}/`),
        current: deck.id === tutorial.id,
      })),
    [seriesDecks, tutorial.id],
  );

  const slideTotal = Math.max(lessonSlideCount, 1);
  const goToSlide = useCallback(
    (index1: number) => {
      const nextSlide = Math.min(slideTotal, Math.max(1, index1));
      void setSlide(nextSlide);
      postToPlayer({ type: "goto", index: nextSlide - 1 });
    },
    [postToPlayer, setSlide, slideTotal],
  );

  return (
    <div className={styles.shell} onKeyDown={onChromeKeyDown}>
      <header className={styles.chrome}>
        <nav className={styles.crumb} aria-label="Tutorial location">
          <ol className={styles.crumbList}>
            <li className={styles.crumbItem} data-tier="root">
              <span className={styles.crumbRole}>Catalog</span>
              <a
                className={`${styles.crumbLink} ${styles.crumbValue}`}
                href={sitePath("/tutorials/")}
              >
                Tutorials
              </a>
              <ul className={styles.crumbMenu} role="list">
                <li>
                  <a
                    className={styles.crumbMenuItem}
                    href={sitePath("/tutorials/")}
                    aria-current="page"
                  >
                    All courses
                  </a>
                </li>
                {coursePeers.map((peer) => (
                  <li key={peer.series}>
                    <a
                      className={styles.crumbMenuItem}
                      href={peer.href}
                      aria-current={peer.current ? "page" : undefined}
                    >
                      {peer.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>

            <li className={styles.crumbItem} data-tier="course">
              <div className={styles.crumbHead}>
                <CompleteToggle
                  state={courseDone}
                  label={seriesTitle}
                  onToggle={() =>
                    toggleCourse(tutorial.series, seriesLessonInputs)
                  }
                />
                <span className={styles.crumbRole}>Course</span>
              </div>
              <span className={styles.crumbValue}>{seriesTitle}</span>
              <ul className={styles.crumbMenu} role="list">
                {coursePeers.map((peer) => (
                  <li key={peer.series}>
                    <a
                      className={styles.crumbMenuItem}
                      href={peer.href}
                      aria-current={peer.current ? "true" : undefined}
                    >
                      {peer.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>

            <li
              className={styles.crumbItem}
              data-tier="lesson"
              aria-current="page"
            >
              <div className={styles.crumbHead}>
                <CompleteToggle
                  state={lessonDone}
                  label={tutorial.title}
                  onToggle={() =>
                    toggleLesson(tutorial.id, lessonSlideCount)
                  }
                />
                <span className={styles.crumbRole}>Lesson</span>
              </div>
              <span className={styles.crumbValue}>
                <span className={styles.crumbOrder}>{lessonOrder}</span>
                <span className={styles.crumbTitle}>{tutorial.title}</span>
              </span>
              <ul className={styles.crumbMenu} role="list">
                {lessonPeers.map((peer) => (
                  <li key={peer.id}>
                    <a
                      className={styles.crumbMenuItem}
                      href={peer.href}
                      aria-current={peer.current ? "page" : undefined}
                    >
                      <span className={styles.crumbMenuOrder}>
                        {String(peer.order).padStart(2, "0")}
                      </span>
                      {peer.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>

            <li
              className={styles.crumbItem}
              data-tier="slide"
              aria-label={slideLabel}
            >
              <div className={styles.crumbHead}>
                <CompleteToggle
                  state={slideDone}
                  label={`Slide ${slide}`}
                  onToggle={() => toggleSlide(tutorial.id, slide)}
                />
                <span className={styles.crumbRole}>Slide</span>
              </div>
              <span
                className={`${styles.crumbValue} ${styles.crumbSlide}`}
                aria-live="polite"
              >
                {slideValue}
              </span>
              <ul className={styles.crumbMenu} role="list">
                {Array.from({ length: slideTotal }, (_, i) => {
                  const n = i + 1;
                  const current = n === slide;
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        className={styles.crumbMenuItem}
                        aria-current={current ? "true" : undefined}
                        onClick={() => goToSlide(n)}
                      >
                        Slide {n}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          </ol>
        </nav>

        <nav
          className={styles.transport}
          aria-label="Lesson and slide navigation"
        >
          {prev ? (
            <a
              className={styles.jump}
              href={sitePath(`/tutorials/${prev.slug}/`)}
              aria-label={`Previous lesson: ${prev.title}`}
              data-tooltip={`Previous lesson · ${prev.title} (Shift+←)`}
            >
              {"<<"}
            </a>
          ) : (
            <span
              className={styles.jumpDisabled}
              aria-disabled="true"
              data-tooltip="No previous lesson"
            >
              {"<<"}
            </span>
          )}

          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => postNav("prev")}
            disabled={!meta.canPrev}
            aria-label={`Previous slide (${slideLabel})`}
            data-tooltip={
              meta.canPrev
                ? `Previous slide · ${slideLabel} (←)`
                : "Start of deck"
            }
          >
            {"<"}
          </button>

          <div className={styles.stepsBlock} onMouseLeave={clearHover}>
            <div
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={seriesTotal}
              aria-valuenow={completedLessonCount}
              aria-valuetext={`${completedLessonCount} of ${seriesTotal} lessons complete`}
            >
              <div
                className={styles.fill}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <ol
              ref={stepsRef}
              className={styles.steps}
              aria-label={`${seriesTitle} lessons`}
            >
              {seriesDecks.map((deck) => {
                const current = deck.id === tutorial.id;
                const state = getLessonState(deck.id, deck.slideCount);
                const active = deck.id === labelId;
                const stepClass =
                  current
                    ? styles.stepCurrent
                    : state === "complete"
                      ? styles.stepDone
                      : state === "partial"
                        ? styles.stepPartial
                        : styles.step;
                return (
                  <li key={deck.id}>
                    <a
                      href={sitePath(`/tutorials/${deck.slug}/`)}
                      className={[stepClass, active ? styles.stepActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                      aria-current={current ? "step" : undefined}
                      aria-label={`Lesson ${deck.order}: ${deck.title}${
                        state === "complete"
                          ? " (complete)"
                          : state === "partial"
                            ? " (partial)"
                            : ""
                      }`}
                      onMouseEnter={() => setHoveredId(deck.id)}
                      onFocus={() => setHoveredId(deck.id)}
                      onBlur={onStepBlur}
                    >
                      {deck.order}
                    </a>
                  </li>
                );
              })}
            </ol>

            <div
              className={styles.lessonLabel}
              data-mode={labelMode}
              aria-live="polite"
            >
              <span className={styles.lessonKey} key={labelDeck.id}>
                <span className={styles.lessonOrder}>
                  {String(labelDeck.order).padStart(2, "0")}
                </span>
                <span className={styles.lessonTitle}>{labelDeck.title}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => postNav("next")}
            disabled={!meta.canNext}
            aria-label={`Next slide (${slideLabel})`}
            data-tooltip={
              meta.canNext
                ? `Next slide · ${slideLabel} (→)`
                : "End of deck"
            }
          >
            {">"}
          </button>

          {next ? (
            <a
              className={styles.jump}
              href={sitePath(`/tutorials/${next.slug}/`)}
              aria-label={`Next lesson: ${next.title}`}
              data-tooltip={`Next lesson · ${next.title} (Shift+→)`}
            >
              {">>"}
            </a>
          ) : (
            <span
              className={styles.jumpDisabled}
              aria-disabled="true"
              data-tooltip="No next lesson"
            >
              {">>"}
            </span>
          )}
        </nav>
      </header>

      <div className={styles.frame}>
        <iframe
          ref={iframeRef}
          className={styles.iframe}
          src={playerSrc}
          title={`${tutorial.title} slides`}
          loading="eager"
          allow="fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}

function CompleteToggle({
  state,
  label,
  onToggle,
}: {
  state: CompletionState;
  label: string;
  onToggle: () => void;
}) {
  const labels = completionLabel(state, label);
  return (
    <button
      type="button"
      className={styles.completeToggle}
      data-complete={state}
      aria-pressed={state === "complete"}
      aria-label={labels.aria}
      title={labels.title}
      onClick={onToggle}
    >
      {completionGlyph(state)}
    </button>
  );
}
