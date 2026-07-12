import { ShowcaseCard } from "@/components/ShowcaseCard";
import { SiteShell } from "@/components/SiteShell";
import { showcases } from "@/content/showcases";
import shared from "@/components/shared.module.css";
import styles from "@/views/showcase.module.css";

export function ShowcaseListPage() {
  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={shared.sectionTitle}>Showcases</h1>
          <p className={styles.intro}>
            Typed examples of reqlan in real workflows — short summaries here,
            full requirement snippets on each page.
          </p>
        </header>

        <div className={styles.grid}>
          {showcases.map((showcase) => (
            <ShowcaseCard key={showcase.id} showcase={showcase} />
          ))}
        </div>
      </main>
    </SiteShell>
  );
}
