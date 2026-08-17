import { CodeBlock } from "@/components/CodeBlock";
import { HeroActions } from "@/components/HeroActions";
import { hero } from "@/content/hero";
import { sitePath } from "@/lib/paths";
import styles from "./Hero.module.css";

export function Hero() {
  // rq:["../../../reqlan rq/site/site.rq".hero_section]

  return (
    <section id="hero" className={styles.hero} aria-label="Introduction">
      <div className={styles.lead}>
        <img
          src={sitePath("/ed-core.svg")}
          alt=""
          width={500}
          height={500}
          className={styles.mascot}
          decoding="async"
        />
        <CodeBlock
          language="rq"
          content={hero.snippet}
          className={styles.snippet}
        />
      </div>

      <HeroActions />
    </section>
  );
}
