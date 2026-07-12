import { CodeBlock } from "@/components/CodeBlock";
import { HeroActions } from "@/components/HeroActions";
import { siteContent } from "@/content/site";
import styles from "./Hero.module.css";

export function Hero() {
  const { hero } = siteContent;

  return (
    <section className={styles.hero} aria-label="Introduction">
      <CodeBlock
        language="rq"
        content={hero.snippet}
        className={styles.snippet}
      />

      <HeroActions />
    </section>
  );
}
