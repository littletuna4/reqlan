"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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

type TooltipPlacement = "top" | "bottom";

type TooltipCoords = {
  top: number;
  left: number;
  placement: TooltipPlacement;
};

const VIEWPORT_PADDING = 8;
const TIP_GAP = 7;

export function RqTip({ className, tip, children }: RqTipProps) {
  const tipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords>({
    top: 0,
    left: 0,
    placement: "top",
  });
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
    const tooltip = tooltipRef.current;
    const anchorCenterX = rect.left + rect.width / 2;

    if (!tooltip) {
      setCoords({
        top: rect.top,
        left: anchorCenterX,
        placement: "top",
      });
      return;
    }

    const tipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const halfWidth = tipRect.width / 2;

    let placement: TooltipPlacement = "top";
    let top = rect.top;

    const roomAbove = rect.top - TIP_GAP - VIEWPORT_PADDING;
    const roomBelow =
      viewportHeight - rect.bottom - TIP_GAP - VIEWPORT_PADDING;

    if (tipRect.height > roomAbove && roomBelow > roomAbove) {
      placement = "bottom";
      top = rect.bottom;
    }

    const left = Math.max(
      VIEWPORT_PADDING + halfWidth,
      Math.min(anchorCenterX, viewportWidth - VIEWPORT_PADDING - halfWidth),
    );

    setCoords({ top, left, placement });
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
  };

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }

    updatePosition();
  }, [visible, tip, updatePosition]);

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

  return (
    <>
      <span
        ref={anchorRef}
        className={className}
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
              ref={tooltipRef}
              id={tipId}
              role="tooltip"
              className={styles.tooltip}
              data-placement={coords.placement}
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
