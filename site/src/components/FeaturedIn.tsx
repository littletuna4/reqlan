import { featured } from "@/content/featured";
import styles from "./FeaturedIn.module.css";

export function FeaturedIn() {
  // rq:["../../../reqlan rq/site/site.rq".featured_in_section]

  return (
    <section
      id="featured-in"
      className={styles.featured}
      aria-labelledby="featured-in-title"
    >
      <h2 id="featured-in-title" className={styles.label}>
        {featured.title}
      </h2>
      <ul className={styles.list}>
        {featured.items.map((item, index) => (
          <li
            key={item.id}
            className={styles.item}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
