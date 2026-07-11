import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import type { Showcase, ShowcaseBlock } from "@/content/showcases";
import cardStyles from "./ShowcaseCard.module.css";
import shared from "./shared.module.css";
import styles from "./ShowcaseDetail.module.css";

type ShowcaseDetailProps = {
  showcase: Showcase;
};

async function ShowcaseBlockView({ block }: { block: ShowcaseBlock }) {
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

  return (
    <div className={styles.block}>
      {block.label ? <p className={shared.syntaxLabel}>{block.label}</p> : null}
      <CodeBlock language={block.language} content={block.code} />
    </div>
  );
}

export async function ShowcaseDetail({ showcase }: ShowcaseDetailProps) {
  return (
    <article className={styles.detail}>
      <Link href="/showcase" className={styles.back}>
        ← All showcases
      </Link>

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
        {await Promise.all(
          showcase.blocks.map(async (block, index) => (
            <ShowcaseBlockView key={index} block={block} />
          )),
        )}
      </div>
    </article>
  );
}
