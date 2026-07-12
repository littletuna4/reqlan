import { motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import styles from "./hover-border-gradient.module.css";

type HoverBorderGradientProps = {
  children: React.ReactNode;
  as?: React.ElementType;
  containerClassName?: string;
  className?: string;
  duration?: number;
  clockwise?: boolean;
  reducedMotion?: boolean;
} & Record<string, unknown>;

export function HoverBorderGradient({
  children,
  as: Component = "button",
  containerClassName,
  className,
  duration = 3,
  clockwise = true,
  reducedMotion = false,
  ...props
}: HoverBorderGradientProps) {
  const [hovered, setHovered] = useState(false);
  const animationDirection = clockwise ? "normal" : "reverse";

  return (
    <Component
      className={cn(styles.container, containerClassName)}
      style={
        reducedMotion
          ? undefined
          : ({ ["--hbg-duration" as string]: `${duration}s` } as React.CSSProperties)
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      {...props}
    >
      {!reducedMotion ? (
        <span className={styles.ring} aria-hidden>
          <motion.span
            className={styles.spin}
            style={{ animationDirection }}
            animate={{ opacity: hovered ? 0.95 : 0.22 }}
            transition={{ duration: 0.25 }}
          />
        </span>
      ) : null}

      <span
        className={cn(
          styles.inner,
          reducedMotion && styles.innerStatic,
          className,
        )}
      >
        {children}
      </span>
    </Component>
  );
}
