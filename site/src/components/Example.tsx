import { RqCode } from "@/components/RqCode";
import { siteContent } from "@/content/site";

export function Example() {
  const { example } = siteContent;

  return (
    <section id="example" className="content-section" aria-labelledby="example-title">
      <h2 id="example-title" className="section-title">
        Example
      </h2>

      <RqCode code={example.code} />
    </section>
  );
}
