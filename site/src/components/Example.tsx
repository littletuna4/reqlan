import { CodeBlock } from "@/components/CodeBlock";
import { siteContent } from "@/content/site";

export async function Example() {
  const { example } = siteContent;

  return (
    <section id="example" className="content-section" aria-labelledby="example-title">
      <h2 id="example-title" className="section-title">
        Example
      </h2>

      <CodeBlock language="rq" content={example.code} />
    </section>
  );
}
