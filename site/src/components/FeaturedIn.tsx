"use client";

import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { PhonebookIcon } from "@/components/PhonebookIcon";
import { featured } from "@/content/featured";
import type { FeaturedItem } from "@/content/types";
import { cn } from "@/lib/utils";
import styles from "./FeaturedIn.module.css";

function FeaturedCard({
  item,
  tabIndex,
}: {
  item: FeaturedItem;
  tabIndex?: number;
}) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.card}
      tabIndex={tabIndex}
    >
      <PhonebookIcon icon={item.icon} className={styles.icon} />
      <span className={styles.cardLabel}>{item.label}</span>
    </a>
  );
}

export function FeaturedIn() {
  // rq:["../../../reqlan rq/site/site.rq".featured_in_section]

  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const items = featured.items;

  return (
    <section
      id="featured-in"
      className={styles.featured}
      aria-labelledby="featured-in-title"
    >
      <h2 id="featured-in-title" className={styles.label}>
        {featured.title}
      </h2>

      {reduceMotion ? (
        <ul className={styles.staticList}>
          {items.map((item) => (
            <li key={item.id}>
              <FeaturedCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div
          className={cn(styles.viewport, paused && styles.paused)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) {
              return;
            }
            setPaused(false);
          }}
        >
          <ul className={styles.srList}>
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className={styles.track} aria-hidden>
            {[0, 1].map((copy) => (
              <div key={copy} className={styles.group}>
                {items.map((item) => (
                  <FeaturedCard
                    key={`${copy}-${item.id}`}
                    item={item}
                    tabIndex={-1}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
