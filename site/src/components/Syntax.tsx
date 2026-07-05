import { siteContent } from "@/content/site";

export function Syntax() {
  const { syntax } = siteContent;

  return (
    <section id="syntax" className="content-section" aria-labelledby="syntax-title">
      <h2 id="syntax-title" className="section-title">
        {syntax.title}
      </h2>
      <p className="section-intro">{syntax.intro}</p>

      <div className="syntax-examples">
        {syntax.examples.map((example) => (
          <article key={example.title} className="syntax-example">
            <header>
              <h3>{example.title}</h3>
              <p>{example.description}</p>
            </header>
            <pre>
              <code>{example.code}</code>
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
