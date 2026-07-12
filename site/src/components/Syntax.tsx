import { CodeBlock } from "@/components/CodeBlock";
import { siteContent } from "@/content/site";
import type { HighlightKey } from "@/generated/highlights";
import shared from "./shared.module.css";
import styles from "./Syntax.module.css";

export function Syntax() {
  const { syntax } = siteContent;

  return (
    <section id="syntax" className={shared.contentSection} aria-labelledby="syntax-title">
      <h2 id="syntax-title" className={shared.sectionTitle}>
        Syntax
      </h2>

      <div className={styles.examples}>
        {syntax.examples.map((example) => (
          <article key={example.label} className={styles.example}>
            <span className={shared.syntaxLabel}>{example.label}</span>
            <CodeBlock
              language={example.language}
              content={example.code}
              highlightKey={
                example.language !== "rq"
                  ? (`syntax:${example.label}` as HighlightKey)
                  : undefined
              }
            />
          </article>
        ))}
      </div>
    </section>
  );
}
