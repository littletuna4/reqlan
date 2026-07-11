import Link from "next/link";
import type { Showcase } from "@/content/showcases";
import styles from "./ShowcaseCard.module.css";

type ShowcaseCardProps = {
  showcase: Showcase;
};

export function ShowcaseCard({ showcase }: ShowcaseCardProps) {
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
        <Link href={`/showcase/${showcase.id}`}>{showcase.title}</Link>
      </h2>

      <p className={styles.cardSummary}>{showcase.summary}</p>

      <Link href={`/showcase/${showcase.id}`} className={styles.cardLink}>
        View showcase
      </Link>
    </article>
  );
}
