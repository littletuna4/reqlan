import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { siteContent } from "@/content/site";

export async function Hero() {
  const { hero, cta } = siteContent;

  return (
    <section className="hero" aria-label="Introduction">
      <CodeBlock
        language="rq"
        content={hero.snippet}
        className="hero-snippet"
      />

      <Link className="cta-button" href={cta.href} prefetch>
        {cta.label}
        <span className="cta-button-arrow" aria-hidden>
          →
        </span>
      </Link>
    </section>
  );
}
