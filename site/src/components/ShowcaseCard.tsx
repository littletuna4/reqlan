import type { Showcase } from "@/content/showcases";
import { sitePath } from "@/lib/paths";
import styles from "./ShowcaseCard.module.css";

type ShowcaseCardProps = {
  showcase: Showcase;
};

export function ShowcaseCard({ showcase }: ShowcaseCardProps) {
  const href = sitePath(`/showcase/${showcase.id}/`);

  return (
    <article className={styles.card}>
      <div className={styles.cardTags}>
        {showcase.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>

      <h2 className={styles.cardTitle}>
        <a href={href}>{showcase.title}</a>
      </h2>

      <p className={styles.cardSummary}>{showcase.summary}</p>

      <a href={href} className={styles.cardLink}>
        View showcase
      </a>
    </article>
  );
}
