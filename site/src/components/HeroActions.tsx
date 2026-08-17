"use client";

import { useEffect, useState } from "react";

import { cta } from "@/content/hero";
import { prefersReducedMotion } from "@/lib/deeplink";
import { sitePath } from "@/lib/paths";
import { InstallSplitButton } from "@/components/InstallSplitButton";
import { Tip } from "@/components/Tip";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import styles from "./HeroActions.module.css";

export function HeroActions() {
  // rq:["../../../reqlan rq/site/site.rq".cta_icon]
  // rq:["../../../reqlan rq/site/site.rq".hero_section]
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        <Tip label="Open the interactive quickstart guide">
          <a href={sitePath(`${cta.href}/`)} className={styles.getStartedLink}>
            <HoverBorderGradient
              as="span"
              reducedMotion={reducedMotion}
              duration={4}
              className={styles.getStartedInner}
            >
              {cta.label}
            </HoverBorderGradient>
          </a>
        </Tip>

        <InstallSplitButton />
      </div>
    </div>
  );
}
