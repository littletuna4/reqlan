import { CodeBlock } from "@/components/CodeBlock";
import { SyntaxClient } from "@/components/SyntaxClient";
import { siteContent } from "@/content/site";
import type { HighlightKey } from "@/generated/highlights";
import shared from "./shared.module.css";

function snippetHighlightKey(
  label: string,
  kind: "rule" | "practical",
  language: string,
): HighlightKey | undefined {
  if (language === "rq") {
    return undefined;
  }
  return `syntax:${label}:${kind}` as HighlightKey;
}

export function Syntax() {
  const { syntax } = siteContent;

  return (
    <section id="syntax" className={shared.contentSection} aria-labelledby="syntax-title">
      <h2 id="syntax-title" className={shared.sectionTitle}>
        {syntax.title}
      </h2>
      {syntax.lead ? <p className={shared.sectionLead}>{syntax.lead}</p> : null}

      <SyntaxClient examples={syntax.examples}>
        {syntax.examples.flatMap((example) => [
          <CodeBlock
            key={`${example.label}-rule`}
            language={example.rule.language}
            content={example.rule.code}
            highlightKey={snippetHighlightKey(
              example.label,
              "rule",
              example.rule.language,
            )}
          />,
          <CodeBlock
            key={`${example.label}-practical`}
            language={example.practical.language}
            content={example.practical.code}
            highlightKey={snippetHighlightKey(
              example.label,
              "practical",
              example.practical.language,
            )}
          />,
        ])}
      </SyntaxClient>
    </section>
  );
}
