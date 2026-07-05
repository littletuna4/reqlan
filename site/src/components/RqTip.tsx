"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./RqTip.module.css";

type RqTipProps = {
  className: string;
  tip: string;
  children: string;
};

type TooltipCoords = {
  top: number;
  left: number;
};

export function RqTip({ className, tip, children }: RqTipProps) {
  const tipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [visible, updatePosition]);

  const handleMouseEnter = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    show();
  };

  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    show();
  };

  const anchorClassName = className.includes("rq-tip")
    ? className
    : `${className} ${styles.anchor}`;

  return (
    <>
      <span
        ref={anchorRef}
        className={anchorClassName}
        tabIndex={0}
        aria-describedby={mounted && visible ? tipId : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={hide}
        onFocus={handleFocus}
        onBlur={hide}
      >
        {children}
      </span>

      {mounted && visible
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              className={styles.tooltip}
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
              }}
            >
              {tip}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
