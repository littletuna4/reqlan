import Image from "next/image";
import Link from "next/link";
import { siteContent } from "@/content/site";

export function Sidebar() {
  const { brand, nav } = siteContent;

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand" aria-label={`${brand.name} home`}>
        <Image
          src="/logo.svg"
          alt=""
          width={40}
          height={38}
          className="sidebar-logo"
          priority
        />
        <span className="sidebar-name">{brand.name}</span>
      </Link>

      <nav className="sidebar-nav" aria-label="Page sections">
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
