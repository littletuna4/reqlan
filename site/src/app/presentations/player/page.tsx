import type { Metadata } from "next";
import { Suspense } from "react";

import { pages } from "@/content/meta";
import { pageMetadata } from "@/lib/site-metadata";
import { PresentationPlayer } from "@/components/PresentationPlayer";
import styles from "./player.module.css";

export const metadata: Metadata = pageMetadata({
  title: pages.player.title,
  description: pages.player.description,
  path: "/presentations/player/",
  index: false,
});

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
