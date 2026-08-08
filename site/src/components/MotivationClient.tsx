"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { MotivationFeature, MotivationSlide } from "@/content/site";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./MotivationClient.module.css";

type MotivationClientProps = {
  title: string;
  lead?: string;
  slides: readonly MotivationSlide[];
};

function SlideBody({
  what,
  why,
  compact = false,
}: {
  what: string;
  why: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(styles.body, compact && styles.bodyCompact)}>
      <p className={styles.what}>{what}</p>
      <p className={styles.why}>
        <span className={styles.whyLabel}>Why</span>
        {why}
      </p>
    </div>
  );
}

export function MotivationClient({
  title,
  lead,
  slides,
}: MotivationClientProps) {
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const [slideIndex, setSlideIndex] = useState(0);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const slideCount = slides.length;
  const activeSlide = slides[slideIndex] ?? slides[0];
  const features = activeSlide?.features ?? [];
  const activeFeature: MotivationFeature | undefined =
    features[featureIndex] ?? features[0];

  const goToSlide = useCallback(
    (nextIndex: number, dir?: number) => {
      if (slideCount === 0) {
        return;
      }
      const wrapped = ((nextIndex % slideCount) + slideCount) % slideCount;
      setDirection(dir ?? (wrapped > slideIndex ? 1 : -1));
      setSlideIndex(wrapped);
      setFeatureIndex(0);
    },
    [slideCount, slideIndex],
  );

  const goToFeature = useCallback(
    (nextIndex: number) => {
      if (features.length === 0) {
        return;
      }
      const wrapped =
        ((nextIndex % features.length) + features.length) % features.length;
      setFeatureIndex(wrapped);
    },
    [features.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const section = document.getElementById("motivation");
      if (!section) {
        return;
      }
      const bounds = section.getBoundingClientRect();
      const inView =
        bounds.top < window.innerHeight * 0.85 &&
        bounds.bottom > window.innerHeight * 0.15;
      if (!inView) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(slideIndex + 1, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(slideIndex - 1, -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        goToFeature(featureIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        goToFeature(featureIndex - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [featureIndex, goToFeature, goToSlide, slideIndex]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) {
      return;
    }

    if (dx < 0) {
      goToSlide(slideIndex + 1, 1);
    } else {
      goToSlide(slideIndex - 1, -1);
    }
  };

  if (!activeSlide) {
    return null;
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: reduceMotion ? 0 : dir > 0 ? 28 : -28,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: reduceMotion ? 0 : dir > 0 ? -20 : 20,
      opacity: 0,
    }),
  };

  const featureVariants = {
    enter: { opacity: 0, y: reduceMotion ? 0 : 8 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -6 },
  };

  return (
    <section
      id="motivation"
      className={shared.contentSection}
      aria-labelledby="motivation-title"
    >
      <h2 id="motivation-title" className={shared.sectionTitle}>
        {title}
      </h2>
      {lead ? <p className={cn(shared.sectionLead, styles.lead)}>{lead}</p> : null}

      <div className={styles.carousel}>
        <div
          role="tablist"
          aria-label="reqlan parts"
          className={styles.segments}
        >
          {slides.map((slide, index) => {
            const isActive = index === slideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${slide.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel`}
                className={cn(styles.segment, isActive && styles.segmentActive)}
                onClick={() => goToSlide(index, index > slideIndex ? 1 : -1)}
              >
                {slide.label}
              </button>
            );
          })}
        </div>

        <div
          className={styles.stage}
          aria-live="polite"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeSlide.id}
              role="tabpanel"
              id={`${baseId}-panel`}
              aria-labelledby={`${baseId}-tab-${activeSlide.id}`}
              className={styles.slide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: reduceMotion ? 0 : 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <p className={styles.slideKicker}>{activeSlide.label}</p>
              <SlideBody what={activeSlide.what} why={activeSlide.why} />

              <div className={styles.hierarchy}>
                <div
                  role="tablist"
                  aria-label={`${activeSlide.label} features`}
                  className={styles.featureStrip}
                >
                  {features.map((feature, index) => {
                    const isActive = index === featureIndex;
                    return (
                      <button
                        key={feature.id}
                        type="button"
                        role="tab"
                        id={`${baseId}-feature-${feature.id}`}
                        aria-selected={isActive}
                        aria-controls={`${baseId}-feature-panel`}
                        className={cn(
                          styles.featureTab,
                          isActive && styles.featureTabActive,
                        )}
                        onClick={() => setFeatureIndex(index)}
                      >
                        {feature.label}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.featureStage}>
                  <AnimatePresence mode="wait">
                    {activeFeature ? (
                      <motion.div
                        key={activeFeature.id}
                        id={`${baseId}-feature-panel`}
                        role="tabpanel"
                        aria-labelledby={`${baseId}-feature-${activeFeature.id}`}
                        className={styles.featureDetail}
                        variants={featureVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                          duration: reduceMotion ? 0 : 0.2,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <p className={styles.featureTitle}>{activeFeature.label}</p>
                        <SlideBody
                          what={activeFeature.what}
                          why={activeFeature.why}
                          compact
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Previous part"
            onClick={() => goToSlide(slideIndex - 1, -1)}
          >
            ‹
          </button>
          <div className={styles.dots}>
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={cn(
                  styles.dot,
                  index === slideIndex && styles.dotActive,
                )}
                onClick={() => goToSlide(index, index > slideIndex ? 1 : -1)}
                aria-label={`Show ${slide.label}`}
                aria-current={index === slideIndex ? "true" : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Next part"
            onClick={() => goToSlide(slideIndex + 1, 1)}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
