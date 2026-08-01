import type { TutorialDeck } from "@/content/tutorial-model";
import { sitePath } from "@/lib/paths";
import styles from "./TutorialCard.module.css";

type TutorialCardProps = {
  tutorial: TutorialDeck;
};

export function TutorialCard({ tutorial }: TutorialCardProps) {
  const href = sitePath(`/tutorials/${tutorial.slug}/`);

  return (
    <article className={styles.card}>
      <span className={styles.meta}>{tutorial.series}</span>
      <h2 className={styles.title}>
        <a href={href}>{tutorial.title}</a>
      </h2>
      <p className={styles.blurb}>{tutorial.blurb}</p>
      <a href={href} className={styles.link}>
        Open deck
      </a>
    </article>
  );
}
