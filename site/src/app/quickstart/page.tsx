import type { Metadata } from "next";
import { QuickstartClient } from "@/components/QuickstartClient";
import { SiteShell } from "@/components/SiteShell";
import { quickstartContent } from "@/content/quickstart";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Get started · reqlan",
  description: quickstartContent.intro,
};

export default function QuickstartPage() {
  return (
    <SiteShell>
      <main className={styles.page}>
        <QuickstartClient />
      </main>
    </SiteShell>
  );
}
