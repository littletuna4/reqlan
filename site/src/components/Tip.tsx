import { cloneElement, type ReactElement } from "react";

import { cn } from "@/lib/utils";
import styles from "./Tip.module.css";

type TipProps = {
  label: string;
  children: ReactElement<{ className?: string; "data-tip"?: string }>;
};

export function Tip({ label, children }: TipProps) {
  return cloneElement(children, {
    "data-tip": label,
    className: cn(children.props.className, styles.anchor),
  });
}
