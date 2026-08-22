import { ShowcaseCard } from "@/components/ShowcaseCard";
import { SiteShell } from "@/components/SiteShell";
import { showcaseFeatureMailto, showcases } from "@/content/showcases";
import shared from "@/components/shared.module.css";
import styles from "@/views/showcase.module.css";

export function ShowcaseListPage() {
  // rq:["../../../reqlan rq/site/site.rq".showcase]
  // rq:["../../../reqlan rq/phonebook.rq".phonebook]

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={shared.sectionTitle}>Showcases</h1>
          <p className={styles.intro}>
            The reqlan development patterns are appropriate to model many types of systems.
            This page showcases some domains and problems that reqlan is particularly well-suited for.
            If you have a project that you'd like us to feature here, please{" "}
            <a href={showcaseFeatureMailto}>reach out to us</a>.
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
