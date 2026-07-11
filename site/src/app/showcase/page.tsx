import type { Metadata } from "next";
import { ShowcaseCard } from "@/components/ShowcaseCard";
import { SiteShell } from "@/components/SiteShell";
import { showcases } from "@/content/showcases";
import shared from "@/components/shared.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Showcases · reqlan",
  description: "Example requirement graphs and extension workflows.",
};

export default function ShowcasePage() {
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
