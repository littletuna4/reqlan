import { siteContent } from "@/content/site";
import styles from "./Footer.module.css";

export function Footer() {
  const { footer } = siteContent;

  return (
    <footer className={styles.footer}>
      <p className={styles.copy}>
        &copy; {new Date().getFullYear()} {footer.copyright}
      </p>
    </footer>
  );
}
