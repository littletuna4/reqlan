"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { TutorialCard } from "@/components/TutorialCard";
import { SiteShell } from "@/components/SiteShell";
import {
  tutorialMatchesQuery,
  tutorialSeriesMeta,
  tutorialSeriesOrder,
  type TutorialDeck,
  type TutorialSeries,
} from "@/content/tutorial-model";
import {
  completionGlyph,
  completionLabel,
  type CompletionState,
} from "@/lib/tutorial-progress";
import { useTutorialProgress } from "@/lib/use-tutorial-progress";
import shared from "@/components/shared.module.css";
import styles from "@/views/tutorials.module.css";

type TutorialsListPageProps = {
  decks: TutorialDeck[];
};

function assessmentMatchesQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return ["assessment", "certificate", "certification", "quiz", "cert"].some(
    (term) => term.includes(q) || q.includes(term),
  );
}

export function TutorialsListPage({ decks }: TutorialsListPageProps) {
  // rq:["../../../reqlan rq/site/site.rq".tutorials_section]
  // rq:["../../../reqlan rq/site/certs.rq".assessment_page]
  // rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series]
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const progress = useTutorialProgress();

  const groups = useMemo(() => {
    return tutorialSeriesOrder
      .map((series) => {
        const seriesDecks = decks.filter(
          (deck) => deck.series === series && tutorialMatchesQuery(deck, query),
        );
        return { series, decks: seriesDecks };
      })
      .filter((group) => group.decks.length > 0);
  }, [decks, query]);

  const [openSeries, setOpenSeries] = useState<Set<TutorialSeries>>(() => {
    return new Set<TutorialSeries>(["get-started"]);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#course-/, "");
    if (tutorialSeriesOrder.includes(hash as TutorialSeries)) {
      setOpenSeries(new Set([hash as TutorialSeries]));
    }
  }, []);

  useEffect(() => {
    if (groups.length === 0) return;
    if (searching) {
      setOpenSeries(new Set(groups.map((group) => group.series)));
      return;
    }
    setOpenSeries((prev) => {
      const stillVisible = [...prev].filter((series) =>
        groups.some((group) => group.series === series),
      );
      if (stillVisible.length > 0) return new Set(stillVisible);
      return new Set([groups[0]!.series]);
    });
  }, [groups, searching]);

  const toggleOpen = (series: TutorialSeries, nextOpen: boolean) => {
    setOpenSeries((prev) => {
      const next = new Set(prev);
      if (nextOpen) next.add(series);
      else next.delete(series);
      return next;
    });
  };

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={shared.sectionTitle}>Tutorials</h1>
          <label className={styles.searchLabel}>
            <span className={styles.visuallyHidden}>Search tutorials</span>
            <input
              type="search"
              className={styles.search}
              placeholder="Search decks…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </label>
        </header>

        {!searching ? (
          <Link
            className={styles.startHere}
            href={"/tutorials/gs-01-why-reqlan" as Route}
          >
            <span className={styles.startHereKicker}>Start here</span>
            <span className={styles.startHereTitle}>Get started series</span>
            <span className={styles.startHereBlurb}>
              Install, write, link, and map your first ideas across seven
              short decks.
            </span>
          </Link>
        ) : null}

        {groups.length === 0 ? (
          <p className={styles.empty}>No decks match “{query.trim()}”.</p>
        ) : (
          <div className={styles.accordion}>
            {groups.map(({ series, decks: seriesDecks }) => {
              const courseState = progress.getCourseState(
                series,
                seriesDecks.map((deck) => ({
                  id: deck.id,
                  slideCount: deck.slideCount,
                })),
              );
              return (
                <SeriesAccordion
                  key={series}
                  series={series}
                  count={seriesDecks.length}
                  open={openSeries.has(series)}
                  completion={courseState}
                  onOpenChange={(nextOpen) => toggleOpen(series, nextOpen)}
                  onToggleComplete={() =>
                    progress.toggleCourse(
                      series,
                      seriesDecks.map((deck) => ({
                        id: deck.id,
                        slideCount: deck.slideCount,
                      })),
                    )
                  }
                >
                  {seriesDecks.map((tutorial) => (
                    <TutorialCard
                      key={tutorial.id}
                      tutorial={tutorial}
                      completion={progress.getLessonState(
                        tutorial.id,
                        tutorial.slideCount,
                      )}
                      onToggleComplete={() =>
                        progress.toggleLesson(tutorial.id, tutorial.slideCount)
                      }
                    />
                  ))}
                </SeriesAccordion>
              );
            })}
          </div>
        )}

        {!searching || assessmentMatchesQuery(query) ? (
          <Link className={styles.assessmentLink} href={"/certs/assessment" as Route}>
            <span className={styles.assessmentTitle}>Certification</span>
            <span className={styles.assessmentBlurb}>
              Pass the assessment, get a certificate
            </span>
          </Link>
        ) : null}
      </main>
    </SiteShell>
  );
}

function SeriesAccordion({
  series,
  count,
  open,
  completion,
  onOpenChange,
  onToggleComplete,
  children,
}: {
  series: TutorialSeries;
  count: number;
  open: boolean;
  completion: CompletionState;
  onOpenChange: (open: boolean) => void;
  onToggleComplete: () => void;
  children: ReactNode;
}) {
  const meta = tutorialSeriesMeta[series];
  const courseId = `course-${series}`;
  const panelId = `${courseId}-panel`;
  const titleId = `${courseId}-title`;
  const labels = completionLabel(completion, meta.title);

  return (
    <section
      id={courseId}
      className={styles.details}
      data-open={open ? "true" : "false"}
    >
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.summaryButton}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
        >
          <span id={titleId} className={styles.summaryTitle}>
            {meta.title}
          </span>
          <span className={styles.count}>{count}</span>
          <span className={styles.chevron} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.completeToggle}
          data-complete={completion}
          aria-pressed={completion === "complete"}
          aria-label={labels.aria}
          title={labels.title}
          onClick={onToggleComplete}
        >
          {completionGlyph(completion)}
        </button>
      </div>
      <div
        id={panelId}
        className={styles.panelShell}
        role="region"
        aria-labelledby={titleId}
        inert={!open}
      >
        <div className={styles.panelClip}>
          <div className={styles.panel}>{children}</div>
        </div>
      </div>
    </section>
  );
}
