"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";

import { siteContent } from "@/content/site";
import { sitePath } from "@/lib/paths";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const { brand, nav } = siteContent;
  const [open, setOpen] = useState(false);
  const navId = useId();

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

      <nav id={navId} className={styles.nav} aria-label="Page sections">
        <ul>
          {nav.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <a href={sitePath(`${item.href}/`)} onClick={close}>
                  {item.label}
                </a>
              ) : (
                <a href={sitePath(`/#${item.id}`)} onClick={close}>
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
