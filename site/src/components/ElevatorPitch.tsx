"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { elevator_pitch } from "@/content/meta";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./ElevatorPitch.module.css";

const HOLD_MS = 4500;

export function ElevatorPitch() {
  // rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]
  // rq:["../../../reqlan rq/site/site.rq".claim_cycle]
  // rq:["../../../reqlan rq/site/site.rq".claim_progress]
  // rq:["../../../reqlan rq/site/site.rq".claim_reduced_motion]
  // rq:["../../../reqlan rq/site/site.rq".claim_expand]

  const claims = elevator_pitch.claims;
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const elapsedRef = useRef(0);
  const showList = Boolean(reduceMotion) || expanded;

  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (showList || paused || claims.length < 2) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;

      if (elapsedRef.current >= HOLD_MS) {
        elapsedRef.current = 0;
        setProgress(0);
        setIndex((current) => (current + 1) % claims.length);
      } else {
        setProgress(elapsedRef.current / HOLD_MS);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [claims.length, paused, showList]);

  const activeClaim = claims[index] ?? claims[0];
  const claimsId = `${baseId}-claims`;

  return (
    <section
      id="elevator-pitch"
      className={styles.pitch}
      aria-labelledby="elevator-pitch-title"
    >
      <div className={styles.headingRow}>
        <h2
          id="elevator-pitch-title"
          className={cn(shared.sectionTitle, styles.heading)}
        >
          {elevator_pitch.title}
        </h2>
        {reduceMotion ? null : (
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={expanded}
            aria-controls={claimsId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "show one" : "show all"}
          </button>
        )}
      </div>
      <p className={styles.lead}>{elevator_pitch.pitch}</p>

      {showList ? (
        <ul id={claimsId} className={styles.staticList}>
          {claims.map((claim) => (
            <li key={claim}>{claim}</li>
          ))}
        </ul>
      ) : (
        <div
          id={claimsId}
          className={styles.cycle}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) {
              return;
            }
            setPaused(false);
          }}
        >
          <ul className={styles.srList}>
            {claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>

          <div className={styles.viewport} aria-hidden>
            {claims.map((claim) => (
              <span key={claim} className={styles.sizer}>
                {claim}
              </span>
            ))}
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={activeClaim}
                className={styles.claim}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeClaim}
              </motion.p>
            </AnimatePresence>
          </div>

          <div
            className={styles.tracks}
            role="tablist"
            aria-label="Pitch claims"
          >
            {claims.map((claim, claimIndex) => {
              const isActive = claimIndex === index;
              const fill =
                claimIndex < index ? 1 : isActive ? progress : 0;
              return (
                <button
                  key={claim}
                  type="button"
                  role="tab"
                  id={`${baseId}-claim-${claimIndex}`}
                  className={styles.track}
                  aria-selected={isActive}
                  aria-label={`Show claim ${claimIndex + 1} of ${claims.length}`}
                  onClick={() => setIndex(claimIndex)}
                >
                  <span className={styles.trackBar}>
                    <span
                      className={cn(
                        styles.trackFill,
                        isActive && paused && styles.trackFillPaused,
                      )}
                      style={{ transform: `scaleX(${fill})` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
