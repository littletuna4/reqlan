import { CodeBlock } from "@/components/CodeBlock";
import type { HighlightKey } from "@/generated/highlights";
import type { Showcase, ShowcaseBlock } from "@/content/showcases";
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
  if ("items" in block) {
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
      </div>
    );
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
    </div>
  );
}

export function ShowcaseDetail({ showcase }: ShowcaseDetailProps) {
  return (
    <article className={styles.detail}>
      <a href={sitePath("/showcase/")} className={styles.back}>
        ← All showcases
      </a>

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
