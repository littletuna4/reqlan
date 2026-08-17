import { footer } from "@/content/meta";
import styles from "./Footer.module.css";

export function Footer() {
  // rq:["../../../reqlan rq/site/site.rq".copy]

  return (
    <footer className={styles.footer}>
      <p className={styles.copy}>
        &copy; {new Date().getFullYear()} {footer.copyright}
      </p>
    </footer>
  );
}
