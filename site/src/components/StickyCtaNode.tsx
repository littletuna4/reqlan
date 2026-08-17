"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { usePathname } from "next/navigation";

import { PhonebookIcon } from "@/components/PhonebookIcon";
import { stickyCta } from "@/content/sticky-cta";
import { getPhonebookLink } from "@/lib/phonebook";
import { sitePath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import styles from "./StickyCtaNode.module.css";

const VIEW_MARGIN_PX = 8;
const WEB_MIN_PX = 769;

type AnchorPos = { right: number; bottom: number };

function isPresentationPlayer(pathname: string): boolean {
  return pathname.includes("/presentations/player");
}

function clampAnchor(
  right: number,
  bottom: number,
  width: number,
  height: number,
): AnchorPos {
  const maxRight = Math.max(
    VIEW_MARGIN_PX,
    window.innerWidth - width - VIEW_MARGIN_PX,
  );
  const maxBottom = Math.max(
    VIEW_MARGIN_PX,
    window.innerHeight - height - VIEW_MARGIN_PX,
  );
  return {
    right: Math.min(Math.max(VIEW_MARGIN_PX, right), maxRight),
    bottom: Math.min(Math.max(VIEW_MARGIN_PX, bottom), maxBottom),
  };
}

function readAnchor(el: HTMLElement): AnchorPos {
  const rect = el.getBoundingClientRect();
  return {
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom,
  };
}

export function StickyCtaNode() {
  // rq:["../../../reqlan rq/site/site.rq".sticky_cta_node]
  const pathname = usePathname();
  const trayRef = useRef<HTMLElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    origRight: 0,
    origBottom: 0,
  });
  const [pos, setPos] = useState<AnchorPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expand, setExpand] = useState<"start" | "end">("start");
  const [stack, setStack] = useState<"above" | "below">("above");

  const github = getPhonebookLink(stickyCta.star.linkId);
  const tryIcon = getPhonebookLink(stickyCta.tryExtension.iconLinkId);

  const applyAnchor = useCallback((next: AnchorPos) => {
    const isWeb = window.innerWidth >= WEB_MIN_PX;
    setPos(next);
    setExpand(next.right > window.innerWidth * 0.42 ? "end" : "start");
    setStack(
      isWeb ? "above" : next.bottom > window.innerHeight * 0.42 ? "below" : "above",
    );
  }, []);

  const syncPlacement = useCallback(() => {
    const el = trayRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const next = pos
      ? clampAnchor(pos.right, pos.bottom, rect.width, rect.height)
      : readAnchor(el);
    if (pos && (next.right !== pos.right || next.bottom !== pos.bottom)) {
      applyAnchor(next);
      return;
    }
    const isWeb = window.innerWidth >= WEB_MIN_PX;
    setExpand(next.right > window.innerWidth * 0.42 ? "end" : "start");
    setStack(
      isWeb ? "above" : next.bottom > window.innerHeight * 0.42 ? "below" : "above",
    );
  }, [applyAnchor, pos]);

  useEffect(() => {
    window.addEventListener("resize", syncPlacement);
    return () => window.removeEventListener("resize", syncPlacement);
  }, [syncPlacement]);

  if (isPresentationPlayer(pathname)) {
    return null;
  }

  const onGripPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    const tray = trayRef.current;
    if (!tray) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const anchor = readAnchor(tray);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origRight: anchor.right,
      origBottom: anchor.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onGripPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) {
      return;
    }
    const tray = trayRef.current;
    if (!tray) {
      return;
    }
    const rect = tray.getBoundingClientRect();
    applyAnchor(
      clampAnchor(
        drag.origRight - (event.clientX - drag.startX),
        drag.origBottom - (event.clientY - drag.startY),
        rect.width,
        rect.height,
      ),
    );
  };

  const onGripPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.pointerId = -1;
    setDragging(false);
  };

  return (
    <aside
      ref={trayRef}
      className={cn(styles.tray, pos && styles.placed)}
      style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
      aria-label={stickyCta.label}
      data-expand={expand}
      data-stack={stack}
      data-dragging={dragging ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.grip}
        aria-label={stickyCta.drag.label}
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
      >
        <span className={styles.dots} aria-hidden>
          <i /><i /><i /><i /><i /><i />
        </span>
      </button>

      <a
        className={cn(styles.action, styles.star)}
        href={github.href}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        aria-label={stickyCta.star.label}
      >
        <PhonebookIcon icon={github.icon} className={styles.icon} />
        <span className={styles.tip}>{stickyCta.star.label}</span>
      </a>

      <a
        className={cn(styles.action, styles.try)}
        href={sitePath(`${stickyCta.tryExtension.href}/`)}
        draggable={false}
        aria-label={stickyCta.tryExtension.label}
      >
        <PhonebookIcon icon={tryIcon.icon} className={styles.icon} />
        <span className={styles.tip}>{stickyCta.tryExtension.label}</span>
      </a>
    </aside>
  );
}
