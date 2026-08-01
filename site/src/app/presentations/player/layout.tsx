import type { ReactNode } from "react";

import styles from "./player.module.css";

/**
 * Full-bleed Reveal host — no SiteShell. Queried by tutorial iframes as
 * /presentations/player/?deck=<id> (static-exported App route).
 */
export default function PresentationPlayerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.shell}>{children}</div>;
}
