import { siteContent } from "@/content/site";

export function Hero() {
  const { hero } = siteContent;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="hero-eyebrow">reqlan</p>
      <h1 id="hero-title" className="hero-title">
        {hero.title}
      </h1>
      <p className="hero-subtitle">{hero.subtitle}</p>
      <p className="hero-tagline">{hero.tagline}</p>
    </section>
  );
}
