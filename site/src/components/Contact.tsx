import { PhonebookIcon } from "@/components/PhonebookIcon";
import { siteContent } from "@/content/site";
import shared from "./shared.module.css";

function LinkList({
  items,
  labelledBy,
}: {
  items: readonly { href: string; label: string; icon: { set: string; name: string } }[];
  labelledBy: string;
}) {
  return (
    <ul className={shared.linkRow} aria-labelledby={labelledBy}>
      {items.map((link) => {
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
  );
}

export function Contact() {
  const { contact } = siteContent;

  return (
    <section id="contact" className={shared.contentSection} aria-labelledby="contact-title">
      <h2 id="contact-title" className={shared.sectionTitle}>
        Links
      </h2>

      <LinkList items={contact.links} labelledBy="contact-title" />

      <h3 id="packages-title" className={shared.subsectionTitle}>
        Packages
      </h3>
      <LinkList items={contact.packages} labelledBy="packages-title" />
    </section>
  );
}
