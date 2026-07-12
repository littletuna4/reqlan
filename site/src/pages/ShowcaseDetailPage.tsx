import { ShowcaseDetail } from "@/components/ShowcaseDetail";
import { SiteShell } from "@/components/SiteShell";
import type { Showcase } from "@/content/showcases";
import styles from "@/pages/showcase.module.css";

type ShowcaseDetailPageProps = {
  showcase: Showcase;
};

export function ShowcaseDetailPage({ showcase }: ShowcaseDetailPageProps) {
  return (
    <SiteShell>
      <main className={styles.page}>
        <ShowcaseDetail showcase={showcase} />
      </main>
    </SiteShell>
  );
}
