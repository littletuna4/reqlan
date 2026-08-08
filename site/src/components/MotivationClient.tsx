"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";
import type { MotivationFeature, MotivationSlide } from "@/content/site";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./MotivationClient.module.css";

type MotivationClientProps = {
  title: string;
  lead?: string;
  slides: readonly MotivationSlide[];
};

type ClaimPairProps = {
  what: string;
  why: string;
  whatId: string;
  whyId: string;
};

function ClaimPair({ what, why, whatId, whyId }: ClaimPairProps) {
  return (
    <dl className={styles.claims}>
      <div className={styles.claim}>
        <dt id={whatId}>Part</dt>
        <dd aria-labelledby={whatId}>{what}</dd>
      </div>
      <div className={styles.claim}>
        <dt id={whyId}>Why</dt>
        <dd aria-labelledby={whyId}>{why}</dd>
      </div>
    </dl>
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
      const inView =
        section.getBoundingClientRect().top < window.innerHeight * 0.85 &&
        section.getBoundingClientRect().bottom > window.innerHeight * 0.15;
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

  if (!activeSlide) {
    return null;
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: reduceMotion ? 0 : dir > 0 ? 48 : -48,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: reduceMotion ? 0 : dir > 0 ? -36 : 36,
      opacity: 0,
    }),
  };

  const featureVariants = {
    enter: { opacity: 0, y: reduceMotion ? 0 : 10 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -8 },
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
      {lead ? <p className={shared.sectionLead}>{lead}</p> : null}

      <div className={styles.carousel}>
        <div className={styles.rail}>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Previous part"
            onClick={() => goToSlide(slideIndex - 1, -1)}
          >
            ‹
          </button>

          <div
            role="tablist"
            aria-label="reqlan parts"
            className={styles.pillList}
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
                  className={cn(styles.pill, isActive && styles.pillActive)}
                  onClick={() => goToSlide(index, index > slideIndex ? 1 : -1)}
                >
                  {slide.label}
                </button>
              );
            })}
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

        <div className={styles.stage} aria-live="polite">
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
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className={styles.slideKicker}>{activeSlide.label}</p>
              <ClaimPair
                what={activeSlide.what}
                why={activeSlide.why}
                whatId={`${baseId}-${activeSlide.id}-what`}
                whyId={`${baseId}-${activeSlide.id}-why`}
              />

              <div className={styles.hierarchy}>
                <p className={styles.hierarchyLabel}>Inside this part</p>
                <div
                  role="tablist"
                  aria-label={`${activeSlide.label} features`}
                  className={styles.featureList}
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
                        <span className={styles.featureIndex}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
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
                          duration: reduceMotion ? 0 : 0.24,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <ClaimPair
                          what={activeFeature.what}
                          why={activeFeature.why}
                          whatId={`${baseId}-${activeFeature.id}-what`}
                          whyId={`${baseId}-${activeFeature.id}-why`}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={styles.dots} aria-hidden="true">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              tabIndex={-1}
              className={cn(styles.dot, index === slideIndex && styles.dotActive)}
              onClick={() => goToSlide(index, index > slideIndex ? 1 : -1)}
              aria-label={`Show ${slide.label}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
