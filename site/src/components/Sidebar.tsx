"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";

import { brand } from "@/content/meta";
import { nav } from "@/content/nav";
import type { NavItem } from "@/content/types";
import { siteBasePath, sitePath } from "@/lib/paths";
import styles from "./Sidebar.module.css";

function normalizePathname(pathname: string): string {
  const base = siteBasePath();
  let path = pathname;
  if (base && path.startsWith(base)) {
    path = path.slice(base.length) || "/";
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path || "/";
}

function itemPath(item: NavItem): string {
  return item.href ?? "/";
}

function isOnItemPage(pathname: string, item: NavItem): boolean {
  const target = itemPath(item);
  if (target === "/") {
    return pathname === "/";
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

function itemHref(item: NavItem, parent?: NavItem): string {
  if (item.href) {
    return sitePath(`${item.href}/`);
  }
  if (parent) {
    const parentHref = parent.href ?? "/";
    if (parentHref === "/") {
      return sitePath(`/#${item.id}`);
    }
    return sitePath(`${parentHref}/#${item.id}`);
  }
  return sitePath("/");
}

export function Sidebar() {
  // rq:["../../../reqlan rq/site/site.rq".sidebar_nav]
  const [open, setOpen] = useState(false);
  // null until mount — avoid flashing Home children on every route
  const [pathname, setPathname] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const navId = useId();

  useEffect(() => {
    const syncLocation = () => {
      setPathname(normalizePathname(window.location.pathname));
      const hash = window.location.hash.replace(/^#/, "");
      setSectionId(hash || null);
    };

    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  useEffect(() => {
    if (pathname === null) {
      return;
    }

    const current = nav.find((item) => isOnItemPage(pathname, item));
    const sectionIds = current?.children?.map((child) => child.id) ?? [];
    if (sectionIds.length === 0) {
      return;
    }

    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target;
        if (top?.id) {
          setSectionId(top.id);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.08, 0.2, 0.4, 0.6],
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [pathname, nav]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const onChange = () => {
      if (media.matches) setOpen(false);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const close = () => setOpen(false);

  const items = useMemo(() => nav, [nav]);

  return (
    <aside className={clsx(styles.sidebar, open && styles.open)}>
      <div className={styles.header}>
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

        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={navId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.menuIcon} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      <button
        type="button"
        className={styles.backdrop}
        tabIndex={-1}
        aria-hidden="true"
        onClick={close}
      />

      <nav id={navId} className={styles.nav} aria-label="Site">
        <ul className={styles.topList}>
          {items.map((item) => {
            const onPage =
              pathname !== null && isOnItemPage(pathname, item);
            const children = item.children ?? [];
            // Stay collapsed until pathname is known (defaults closed on load)
            const showChildren = onPage && children.length > 0;
            const pageCurrent = onPage && !sectionId;

            return (
              <li key={item.id} className={styles.topItem}>
                <a
                  href={itemHref(item)}
                  className={clsx(styles.link, onPage && styles.linkCurrent)}
                  aria-current={pageCurrent || (onPage && children.length === 0) ? "page" : undefined}
                  onClick={close}
                >
                  {item.label}
                </a>

                {showChildren ? (
                  <ul className={styles.childList} aria-label={`${item.label} on this page`}>
                    {children.map((child) => {
                      const childCurrent = sectionId === child.id;
                      return (
                        <li key={child.id}>
                          <a
                            href={itemHref(child, item)}
                            className={clsx(
                              styles.link,
                              styles.childLink,
                              childCurrent && styles.linkCurrent,
                            )}
                            aria-current={childCurrent ? "location" : undefined}
                            onClick={close}
                          >
                            {child.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
