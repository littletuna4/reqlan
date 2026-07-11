import { PhonebookIcon } from "@/components/PhonebookIcon";
import { siteContent } from "@/content/site";
import shared from "./shared.module.css";

export function Contact() {
  const { contact } = siteContent;

  return (
    <section id="contact" className={shared.contentSection} aria-labelledby="contact-title">
      <h2 id="contact-title" className={shared.sectionTitle}>
        Links
      </h2>

      <ul className={shared.linkRow}>
        {contact.links.map((link) => {
          const isExternal = link.href.startsWith("http");

          return (
            <li key={link.href}>
              <a
                href={link.href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <PhonebookIcon icon={link.icon} />
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
