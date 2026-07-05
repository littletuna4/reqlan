import { siteContent } from "@/content/site";

export function Example() {
  const { example } = siteContent;

  return (
    <section id="example" className="content-section" aria-labelledby="example-title">
      <h2 id="example-title" className="section-title">
        {example.title}
      </h2>
      <p className="section-intro">{example.intro}</p>

      <figure className="code-figure">
        <pre>
          <code>{example.code}</code>
        </pre>
        <figcaption>{example.caption}</figcaption>
      </figure>
    </section>
  );
}
