import { CodeBlock } from "@/components/CodeBlock";
import { siteContent } from "@/content/site";
import shared from "./shared.module.css";

export function Example() {
  const { example } = siteContent;

  return (
    <section id="example" className={shared.contentSection} aria-labelledby="example-title">
      <h2 id="example-title" className={shared.sectionTitle}>
        {example.title}
      </h2>
      {example.lead ? <p className={shared.sectionLead}>{example.lead}</p> : null}

      <CodeBlock language="rq" content={example.code} />
    </section>
  );
}
