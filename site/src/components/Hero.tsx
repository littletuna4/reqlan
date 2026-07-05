import { RqCode } from "@/components/RqCode";
import { siteContent } from "@/content/site";

export function Hero() {
  const { hero, cta } = siteContent;

  return (
    <section className="hero" aria-label="Introduction">
      <RqCode code={hero.snippet} className="hero-snippet" />

      <a className="cta-button" href={cta.href}>
        {cta.label}
      </a>
    </section>
  );
}
