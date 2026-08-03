import { Suspense } from "react";

import { TutorialPlayerShell } from "@/components/TutorialPlayerShell";
import { SiteShell } from "@/components/SiteShell";
import {
  getTutorialNeighbors,
  tutorialDecks,
  tutorialSeriesMeta,
  tutorialSeriesOrder,
  type TutorialDeck,
} from "@/content/tutorials";
import styles from "@/views/tutorials.module.css";

type TutorialDetailPageProps = {
  tutorial: TutorialDeck;
};

export function TutorialDetailPage({ tutorial }: TutorialDetailPageProps) {
  const neighbors = getTutorialNeighbors(tutorial);
  const seriesTitle = tutorialSeriesMeta[tutorial.series].title;
  const courses = tutorialSeriesOrder.flatMap((series) => {
    const first = tutorialDecks.find((deck) => deck.series === series);
    if (!first) return [];
    return [
      {
        series,
        title: tutorialSeriesMeta[series].title,
        slug: first.slug,
      },
    ];
  });

  return (
    <SiteShell>
      <main className={styles.pageDeck} data-wide>
        <Suspense fallback={null}>
          <TutorialPlayerShell
            tutorial={tutorial}
            neighbors={neighbors}
            seriesTitle={seriesTitle}
            courses={courses}
          />
        </Suspense>
      </main>
    </SiteShell>
  );
}
