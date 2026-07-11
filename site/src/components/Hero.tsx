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

      <a className="cta-button" href={cta.href}>
        {cta.label}
      </a>
    </section>
  );
}
