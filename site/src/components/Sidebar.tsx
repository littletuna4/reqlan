import Image from "next/image";
import Link from "next/link";
import { siteContent } from "@/content/site";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const { brand, nav } = siteContent;

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label={`${brand.name} home`}>
        <Image
          src="/logo.svg"
          alt=""
          width={40}
          height={38}
          className={styles.logo}
          priority
        />
        <span className={styles.name}>{brand.name}</span>
      </Link>

      <nav className={styles.nav} aria-label="Page sections">
        <ul>
          {nav.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <Link href={`/#${item.id}`}>{item.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
