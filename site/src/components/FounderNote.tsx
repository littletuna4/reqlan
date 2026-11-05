import { founderNote } from "@/content/founder-note";
import { sitePath } from "@/lib/paths";
import shared from "./shared.module.css";
import styles from "./FounderNote.module.css";

export function FounderNote() {
  // rq:["../../../reqlan rq/site/site.rq".founder_note_section]

  return (
    <section
      id="founder-note"
      className={shared.contentSection}
      aria-labelledby="founder-note-title"
    >
      <h2 id="founder-note-title" className={shared.sectionTitle}>
        {founderNote.title}
      </h2>

      <figure className={styles.card}>
        <img
          src={sitePath(founderNote.photo.src)}
          alt={founderNote.photo.alt}
          width={320}
          height={320}
          className={styles.photo}
          loading="lazy"
          decoding="async"
        />

        <div className={styles.body}>
          <span className={styles.mark} aria-hidden="true">
            &ldquo;
          </span>
          <blockquote className={styles.quote}>
            {founderNote.quote.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </blockquote>

          <figcaption className={styles.caption}>
            <span className={styles.name}>{founderNote.name}</span>
            <span className={styles.role}>{founderNote.role}</span>
          </figcaption>

          <ul className={styles.links} aria-label="Get in touch">
            {founderNote.links.map((link) => {
              const isExternal = link.href.startsWith("http");
              return (
                <li key={link.id}>
                  <a
                    href={link.href}
                    {...(isExternal
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </figure>
    </section>
  );
}
