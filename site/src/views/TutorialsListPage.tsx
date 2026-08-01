import { TutorialCard } from "@/components/TutorialCard";
import { SiteShell } from "@/components/SiteShell";
import {
  tutorialSeriesMeta,
  tutorialsBySeries,
  type TutorialSeries,
} from "@/content/tutorials";
import shared from "@/components/shared.module.css";
import styles from "@/views/tutorials.module.css";

const seriesOrder: TutorialSeries[] = ["get-started", "advanced"];

export function TutorialsListPage() {
  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={shared.sectionTitle}>Tutorials</h1>
          <p className={styles.intro}>Slide decks for get-started and advanced.</p>
        </header>

        {seriesOrder.map((series) => {
          const meta = tutorialSeriesMeta[series];
          const decks = tutorialsBySeries(series);
          return (
            <section key={series} className={styles.series}>
              <h2 className={styles.seriesTitle}>{meta.title}</h2>
              <p className={styles.seriesIntro}>{meta.intro}</p>
              <div className={styles.list}>
                {decks.map((tutorial) => (
                  <TutorialCard key={tutorial.id} tutorial={tutorial} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </SiteShell>
  );
}
