import { PhonebookIcon } from "@/components/PhonebookIcon";
import { SiteShell } from "@/components/SiteShell";
import shared from "@/components/shared.module.css";
import { siteContent } from "@/content/site";
import { getPhonebookLink } from "@/lib/phonebook";
import styles from "@/views/faq.module.css";

export function FaqPage() {
  // rq:["../../../reqlan rq/site/site.rq".faq_page]
  const { faq } = siteContent;

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={shared.sectionTitle}>{faq.title}</h1>
          <p className={styles.intro}>{faq.lead}</p>
        </header>

        <div className={styles.list}>
          {faq.items.map((item) => (
            <section
              key={item.id}
              id={item.id}
              className={styles.item}
              aria-labelledby={`${item.id}-q`}
            >
              <h2 id={`${item.id}-q`} className={styles.question}>
                {item.question}
              </h2>
              <p className={styles.answer}>{item.answer}</p>
              {item.links ? (
                <ul className={styles.supportLinks}>
                  {item.links.map((link) => {
                    const phonebook = getPhonebookLink(link.id);
                    const isExternal = phonebook.href.startsWith("http");
                    return (
                      <li key={link.id}>
                        <a
                          href={phonebook.href}
                          {...(isExternal
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        >
                          <PhonebookIcon icon={phonebook.icon} />
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </main>
    </SiteShell>
  );
}
