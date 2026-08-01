import type { Metadata } from "next";
import { Suspense } from "react";

import { PresentationPlayer } from "@/components/PresentationPlayer";
import styles from "./player.module.css";

export const metadata: Metadata = {
  title: "reqlan · tutorial deck",
  description: "Reveal.js tutorial slide deck",
};

export default function PresentationPlayerPage() {
  return (
    <main className={styles.main}>
      <Suspense
        fallback={<p className={styles.loading}>Loading deck…</p>}
      >
        <PresentationPlayer />
      </Suspense>
    </main>
  );
}
