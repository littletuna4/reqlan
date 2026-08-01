import { Suspense } from "react";

import { TutorialPlayerShell } from "@/components/TutorialPlayerShell";
import { SiteShell } from "@/components/SiteShell";
import {
  getTutorialNeighbors,
  tutorialSeriesMeta,
  type TutorialDeck,
} from "@/content/tutorials";
import styles from "@/views/tutorials.module.css";

type TutorialDetailPageProps = {
  tutorial: TutorialDeck;
};

export function TutorialDetailPage({ tutorial }: TutorialDetailPageProps) {
  const neighbors = getTutorialNeighbors(tutorial);
  const seriesTitle = tutorialSeriesMeta[tutorial.series].title;

  return (
    <SiteShell>
      <main className={styles.pageDeck} data-wide>
        <Suspense fallback={null}>
          <TutorialPlayerShell
            tutorial={tutorial}
            neighbors={neighbors}
            seriesTitle={seriesTitle}
          />
        </Suspense>
      </main>
    </SiteShell>
  );
}
