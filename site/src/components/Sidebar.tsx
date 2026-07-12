import { siteContent } from "@/content/site";
import { sitePath } from "@/lib/paths";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const { brand, nav } = siteContent;

  return (
    <aside className={styles.sidebar}>
      <a href={sitePath("/")} className={styles.brand} aria-label={`${brand.name} home`}>
        <img
          src={sitePath("/logo.svg")}
          alt=""
          width={40}
          height={38}
          className={styles.logo}
        />
        <span className={styles.name}>{brand.name}</span>
      </a>

      <nav className={styles.nav} aria-label="Page sections">
        <ul>
          {nav.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <a href={sitePath(`${item.href}/`)}>{item.label}</a>
              ) : (
                <a href={sitePath(`/#${item.id}`)}>{item.label}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
