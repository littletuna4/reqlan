import { QuickstartClient } from "@/components/QuickstartClient";
import { SiteShell } from "@/components/SiteShell";
import styles from "@/pages/quickstart.module.css";

export function QuickstartPage() {
  return (
    <SiteShell>
      <main className={styles.page}>
        <QuickstartClient />
      </main>
    </SiteShell>
  );
}
