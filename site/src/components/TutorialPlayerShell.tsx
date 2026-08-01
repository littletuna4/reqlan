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

import type { TutorialDeck, TutorialNeighbors } from "@/content/tutorial-model";
import { sitePath } from "@/lib/paths";
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

type TutorialPlayerShellProps = {
  tutorial: TutorialDeck;
  neighbors: TutorialNeighbors;
  seriesTitle: string;
};

export function TutorialPlayerShell({
  tutorial,
  neighbors,
  seriesTitle,
}: TutorialPlayerShellProps) {
  const { prev, next, seriesIndex, seriesTotal, seriesDecks } = neighbors;
  const progressPct =
    seriesTotal <= 1 ? 100 : ((seriesIndex + 1) / seriesTotal) * 100;

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

  return (
    <div className={styles.shell} onKeyDown={onChromeKeyDown}>
      <header className={styles.chrome}>
        <div className={styles.top}>
          <p className={styles.crumb}>
            <a href={sitePath("/tutorials/")}>Tutorials</a>
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
            <span className={styles.series}>{seriesTitle}</span>
            <span className={styles.count} aria-hidden="true">
              {seriesIndex + 1}/{seriesTotal}
            </span>
          </p>
        </div>

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
              aria-valuemin={1}
              aria-valuemax={seriesTotal}
              aria-valuenow={seriesIndex + 1}
              aria-valuetext={`${tutorial.title}, ${seriesIndex + 1} of ${seriesTotal}`}
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
              {seriesDecks.map((deck, i) => {
                const current = deck.id === tutorial.id;
                const done = i < seriesIndex;
                const active = deck.id === labelId;
                return (
                  <li key={deck.id}>
                    <a
                      href={sitePath(`/tutorials/${deck.slug}/`)}
                      className={[
                        current
                          ? styles.stepCurrent
                          : done
                            ? styles.stepDone
                            : styles.step,
                        active ? styles.stepActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-current={current ? "step" : undefined}
                      aria-label={`Lesson ${deck.order}: ${deck.title}`}
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
