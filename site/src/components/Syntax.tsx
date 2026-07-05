import { RqCode } from "@/components/RqCode";
import { siteContent } from "@/content/site";

export function Syntax() {
  const { syntax } = siteContent;

  return (
    <section id="syntax" className="content-section" aria-labelledby="syntax-title">
      <h2 id="syntax-title" className="section-title">
        Syntax
      </h2>

      <div className="syntax-examples">
        {syntax.examples.map((example) => (
          <article key={example.label} className="syntax-example">
            <span className="syntax-label">{example.label}</span>
            <RqCode code={example.code} />
          </article>
        ))}
      </div>
    </section>
  );
}
