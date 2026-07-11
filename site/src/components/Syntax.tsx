import { CodeBlock } from "@/components/CodeBlock";
import { siteContent } from "@/content/site";

export async function Syntax() {
  const { syntax } = siteContent;

  return (
    <section id="syntax" className="content-section" aria-labelledby="syntax-title">
      <h2 id="syntax-title" className="section-title">
        Syntax
      </h2>

      <div className="syntax-examples">
        {await Promise.all(
          syntax.examples.map(async (example) => (
            <article key={example.label} className="syntax-example">
              <span className="syntax-label">{example.label}</span>
              <CodeBlock language={example.language} content={example.code} />
            </article>
          )),
        )}
      </div>
    </section>
  );
}
