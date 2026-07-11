import { CodeBlock } from "@/components/CodeBlock";
import { PhonebookIcon } from "@/components/PhonebookIcon";
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
        <PhonebookIcon icon={cta.icon} className="phonebook-icon cta-button-icon" />
        {cta.label}
      </a>
    </section>
  );
}
