"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useReducedMotion } from "motion/react";

import { siteContent, type RoadmapItem } from "@/content/site";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./Roadmap.module.css";

type ItemStyle = {
  scale: number;
  opacity: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function styleForDistance(distance: number, reduceMotion: boolean): ItemStyle {
  if (reduceMotion) {
    return { scale: 1, opacity: distance < 0.55 ? 1 : 0.55 };
  }
  const t = clamp(1 - distance, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return {
    scale: 0.72 + eased * 0.28,
    opacity: 0.35 + eased * 0.65,
  };
}

export function Roadmap() {
  const { roadmap } = siteContent;
  const items = roadmap.items;
  const reduceMotion = useReducedMotion() ?? false;
  const listId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [itemStyles, setItemStyles] = useState<ItemStyle[]>(() =>
    items.map((_, index) => styleForDistance(index === 0 ? 0 : 1, false)),
  );

  const updateScales = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const centerY = scrollerRect.top + scrollerRect.height / 2;
    const half = Math.max(scrollerRect.height / 2, 1);
    let nearest = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    const nextStyles: ItemStyle[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const node = itemRefs.current[index];
      if (!node) {
        nextStyles.push({ scale: 0.72, opacity: 0.35 });
        continue;
      }
      const rect = node.getBoundingClientRect();
      const itemCenter = rect.top + rect.height / 2;
      const distance = Math.abs(itemCenter - centerY) / half;
      nextStyles.push(styleForDistance(distance, reduceMotion));
      if (distance < nearestDist) {
        nearestDist = distance;
        nearest = index;
      }
    }

    setItemStyles(nextStyles);
    setActiveIndex(nearest);
  }, [items.length, reduceMotion]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateScales);
    };

    updateScales();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateScales]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const node = itemRefs.current[index];
      if (!scroller || !node) {
        return;
      }
      const scrollerRect = scroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const delta =
        nodeRect.top +
        nodeRect.height / 2 -
        (scrollerRect.top + scrollerRect.height / 2);
      scroller.scrollTo({
        top: scroller.scrollTop + delta,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    },
    [reduceMotion],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      scrollToIndex(Math.min(activeIndex + 1, items.length - 1));
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      scrollToIndex(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      scrollToIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      scrollToIndex(items.length - 1);
    }
  };

  return (
    <section id="roadmap" className={shared.contentSection} aria-labelledby="roadmap-title">
      <h2 id="roadmap-title" className={shared.sectionTitle}>
        {roadmap.title}
      </h2>
      {roadmap.lead ? <p className={shared.sectionLead}>{roadmap.lead}</p> : null}

      <div className={styles.shell}>
        <div
          ref={scrollerRef}
          className={styles.scroller}
          tabIndex={0}
          role="listbox"
          id={listId}
          aria-label="Roadmap items"
          aria-activedescendant={`${listId}-item-${items[activeIndex]?.id ?? "0"}`}
          onKeyDown={onKeyDown}
        >
          <div className={styles.spacer} aria-hidden="true" />
          {items.map((item, index) => (
            <RoadmapSlide
              key={item.id}
              item={item}
              index={index}
              listId={listId}
              active={index === activeIndex}
              style={itemStyles[index] ?? { scale: 0.72, opacity: 0.35 }}
              reduceMotion={reduceMotion}
              onSelect={() => scrollToIndex(index)}
              setRef={(node) => {
                itemRefs.current[index] = node;
              }}
            />
          ))}
          <div className={styles.spacer} aria-hidden="true" />
        </div>

        <div className={styles.dots} role="presentation">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(styles.dot, index === activeIndex && styles.dotActive)}
              aria-label={`${item.horizon}: ${item.label}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoadmapSlide({
  item,
  index,
  listId,
  active,
  style,
  reduceMotion,
  onSelect,
  setRef,
}: {
  item: RoadmapItem;
  index: number;
  listId: string;
  active: boolean;
  style: ItemStyle;
  reduceMotion: boolean;
  onSelect: () => void;
  setRef: (node: HTMLElement | null) => void;
}) {
  return (
    <article
      ref={setRef}
      id={`${listId}-item-${item.id}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className={cn(styles.item, active && styles.itemActive)}
      style={{
        transform: `scale(${style.scale})`,
        opacity: style.opacity,
        transition: reduceMotion ? undefined : "transform 80ms linear, opacity 80ms linear",
      }}
      onClick={onSelect}
      data-index={index}
    >
      <p className={styles.horizon}>{item.horizon}</p>
      <h3 className={styles.label}>{item.label}</h3>
      <p className={styles.detail}>{item.detail}</p>
    </article>
  );
}
