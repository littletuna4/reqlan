"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { siteContent } from "@/content/site";
import { prefersReducedMotion } from "@/lib/deeplink";
import { InstallSplitButton } from "@/components/InstallSplitButton";
import { Tip } from "@/components/Tip";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import styles from "./HeroActions.module.css";

export function HeroActions() {
  const { cta } = siteContent;
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        <Tip label="Open the interactive quickstart guide">
          <Link href={cta.href} prefetch className={styles.getStartedLink}>
            <HoverBorderGradient
              as="span"
              reducedMotion={reducedMotion}
              duration={4}
              className={styles.getStartedInner}
            >
              {cta.label}
            </HoverBorderGradient>
          </Link>
        </Tip>

        <InstallSplitButton />
      </div>
    </div>
  );
}
