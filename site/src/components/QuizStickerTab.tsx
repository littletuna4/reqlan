"use client";

import { useEffect, useId, useRef, useState } from "react";

import { PhonebookIcon } from "@/components/PhonebookIcon";
import { quizStickerTab } from "@/content/quiz-sticker";
import { getPhonebookLink } from "@/lib/phonebook";
import { sitePath } from "@/lib/paths";
import styles from "./QuizStickerTab.module.css";

export function QuizStickerTab() {
  // rq:["../../../reqlan rq/site/site.rq".quiz_sticker_tab]
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const collapseRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const sticker = getPhonebookLink(quizStickerTab.iconLinkId);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      collapseRef.current?.focus();
      wasOpen.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside className={styles.tab} data-open={open ? "true" : "false"}>
      <button
        ref={collapseRef}
        type="button"
        className={styles.collapsed}
        aria-expanded={open}
        aria-controls={panelId}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen(true)}
      >
        <PhonebookIcon icon={sticker.icon} className={styles.mark} />
        <span className={styles.label}>{quizStickerTab.label}</span>
      </button>

      <div
        id={panelId}
        className={styles.panel}
        role="region"
        aria-labelledby={titleId}
        inert={!open}
      >
        <div className={styles.head}>
          <PhonebookIcon icon={sticker.icon} className={styles.headMark} />
          <h2 id={titleId} className={styles.heading}>
            {quizStickerTab.heading}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={quizStickerTab.close}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <p className={styles.body}>{quizStickerTab.body}</p>
        <a className={styles.cta} href={sitePath(quizStickerTab.href)}>
          {quizStickerTab.cta}
        </a>
      </div>
    </aside>
  );
}
