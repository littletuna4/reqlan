import { PhonebookIcon } from "@/components/PhonebookIcon";
import { footer } from "@/content/meta";
import { phonebookFooterLinks } from "@/lib/phonebook";
import styles from "./Footer.module.css";

export function Footer() {
  // rq:["../../../reqlan rq/site/site.rq".footer]
  // rq:["../../../reqlan rq/site/site.rq".copy]
  // rq:["../../../reqlan rq/phonebook.rq".show_in_footer]

  return (
    <footer className={styles.footer}>
      <nav aria-label="Project links">
        <ul className={styles.links}>
          {phonebookFooterLinks.map((link) => {
            const isExternal = link.href.startsWith("http");

            return (
              <li key={link.id}>
                <a
                  href={link.href}
                  aria-label={link.label}
                  title={link.label}
                  {...(isExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {link.icon ? (
                    <PhonebookIcon icon={link.icon} />
                  ) : (
                    link.label
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className={styles.copy}>
        &copy; {new Date().getFullYear()} {footer.copyright}
      </p>
    </footer>
  );
}
