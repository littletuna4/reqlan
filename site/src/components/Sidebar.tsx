import Image from "next/image";
import { siteContent } from "@/content/site";

export function Sidebar() {
  const { brand, nav } = siteContent;

  return (
    <aside className="sidebar">
      <a href="#" className="sidebar-brand" aria-label={`${brand.name} home`}>
        <Image
          src="/logo.svg"
          alt=""
          width={40}
          height={38}
          className="sidebar-logo"
          priority
        />
        <span className="sidebar-name">{brand.name}</span>
      </a>

      <nav className="sidebar-nav" aria-label="Page sections">
        <ul>
          {nav.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
