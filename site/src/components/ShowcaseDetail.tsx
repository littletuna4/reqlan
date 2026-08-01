import { CodeBlock } from "@/components/CodeBlock";
import type { HighlightKey } from "@/generated/highlights";
import {
  isCodeBlock,
  type Showcase,
  type ShowcaseBlock,
} from "@/content/showcases";
import { sitePath } from "@/lib/paths";
import cardStyles from "./ShowcaseCard.module.css";
import shared from "./shared.module.css";
import styles from "./ShowcaseDetail.module.css";

type ShowcaseDetailProps = {
  showcase: Showcase;
};

function ShowcaseBlockView({
  block,
  showcaseId,
  index,
}: {
  block: ShowcaseBlock;
  showcaseId: string;
  index: number;
}) {
  if ("kind" in block && block.kind === "callout") {
    return (
      <p className={styles.callout}>
        {block.text}
      </p>
    );
  }

  if ("kind" in block && block.kind === "exchange") {
    return (
      <div className={styles.block}>
        {block.label ? (
          <p className={shared.syntaxLabel}>{block.label}</p>
        ) : null}
        <div className={styles.exchange}>
          <pre className={styles.exchangeQuery}>
            <span className={styles.exchangePrompt}>$</span> {block.query}
          </pre>
          <pre className={styles.exchangeResponse}>{block.response}</pre>
        </div>
      </div>
    );
  }

  if ("kind" in block && block.kind === "diagnostic") {
    const severity = block.severity ?? "error";
    return (
      <div className={styles.block}>
        {block.label ? (
          <p className={shared.syntaxLabel}>{block.label}</p>
        ) : null}
        <div
          className={
            severity === "warning" ? styles.diagnosticWarning : styles.diagnostic
          }
        >
          <p className={styles.diagnosticMessage}>
            <span className={styles.diagnosticSeverity}>{severity}</span>
            {block.message}
          </p>
          {block.fixes && block.fixes.length > 0 ? (
            <ul className={styles.diagnosticFixes}>
              {block.fixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  if ("kind" in block && block.kind === "diagram") {
    return (
      <div className={styles.block}>
        {block.label ? (
          <p className={shared.syntaxLabel}>{block.label}</p>
        ) : null}
        <pre className={styles.diagram}>{block.content}</pre>
        {block.caption ? (
          <p className={styles.caption}>{block.caption}</p>
        ) : null}
      </div>
    );
  }

  if ("kind" in block && block.kind === "features") {
    return (
      <div className={styles.block}>
        {block.label ? (
          <p className={shared.syntaxLabel}>{block.label}</p>
        ) : null}
        <ul className={shared.featureList}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {block.caption ? (
          <p className={styles.caption}>{block.caption}</p>
        ) : null}
      </div>
    );
  }

  if (!isCodeBlock(block)) {
    return null;
  }

  const highlightKey: HighlightKey | undefined =
    block.language !== "rq"
      ? (`showcase:${showcaseId}:${index}` as HighlightKey)
      : undefined;

  return (
    <div className={styles.block}>
      {block.label ? <p className={shared.syntaxLabel}>{block.label}</p> : null}
      <CodeBlock
        language={block.language}
        content={block.code}
        highlightKey={highlightKey}
      />
      {block.caption ? <p className={styles.caption}>{block.caption}</p> : null}
    </div>
  );
}

export function ShowcaseDetail({ showcase }: ShowcaseDetailProps) {
  return (
    <article className={styles.detail}>
      <a href={sitePath("/showcase/")} className={styles.back}>
        ← All showcases
      </a>

      <div className={styles.meta}>
        <span className={styles.mechanism}>{showcase.mechanism}</span>
        <span className={styles.domain}>{showcase.domain}</span>
      </div>

      <div className={styles.detailTags}>
        {showcase.tags.map((tag) => (
          <span key={tag} className={cardStyles.tag}>
            {tag}
          </span>
        ))}
      </div>

      <h1 className={styles.title}>{showcase.title}</h1>
      <p className={styles.summary}>{showcase.summary}</p>

      <div className={styles.blocks}>
        {showcase.blocks.map((block, index) => (
          <ShowcaseBlockView
            key={index}
            block={block}
            showcaseId={showcase.id}
            index={index}
          />
        ))}
      </div>
    </article>
  );
}
