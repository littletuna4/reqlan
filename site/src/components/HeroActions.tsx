"use client";

import { useEffect, useState } from "react";

import { PhonebookIcon } from "@/components/PhonebookIcon";
import { cta, starCta } from "@/content/hero";
import { prefersReducedMotion } from "@/lib/deeplink";
import { getPhonebookLink } from "@/lib/phonebook";
import { sitePath } from "@/lib/paths";
import { CliInstallButton, InstallSplitButton } from "@/components/InstallSplitButton";
import { Tip } from "@/components/Tip";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import styles from "./HeroActions.module.css";

export function HeroActions() {
  // rq:["../../../reqlan rq/site/site.rq".cta_icon]
  // rq:["../../../reqlan rq/site/site.rq".install_cli_menu]
  // rq:["../../../reqlan rq/site/site.rq".hero_section]
  // rq:["../../../reqlan rq/site/site.rq".get_started_cta_motion]
  // rq:["../../../reqlan rq/site/site.rq".hero_github_star]
  const github = getPhonebookLink(starCta.linkId);
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
        <CliInstallButton />

        <a
          href={github.href}
          className={styles.star}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PhonebookIcon icon={github.icon} className={styles.starIcon} />
          {starCta.label}
        </a>
      </div>
    </div>
  );
}
