import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import type { Showcase, ShowcaseBlock } from "@/content/showcases";

type ShowcaseDetailProps = {
  showcase: Showcase;
};

async function ShowcaseBlockView({ block }: { block: ShowcaseBlock }) {
  if ("items" in block) {
    return (
      <div className="showcase-block">
        {block.label ? (
          <p className="syntax-label">{block.label}</p>
        ) : null}
        <ul className="feature-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="showcase-block">
      {block.label ? <p className="syntax-label">{block.label}</p> : null}
      <CodeBlock language={block.language} content={block.code} />
    </div>
  );
}

export async function ShowcaseDetail({ showcase }: ShowcaseDetailProps) {
  return (
    <article className="showcase-detail">
      <Link href="/showcase" className="showcase-back">
        ← All showcases
      </Link>

      <div className="showcase-detail-tags">
        {showcase.tags.map((tag) => (
          <span key={tag} className="showcase-tag">
            {tag}
          </span>
        ))}
      </div>

      <h1 className="showcase-detail-title">{showcase.title}</h1>
      <p className="showcase-detail-summary">{showcase.summary}</p>

      <div className="showcase-detail-blocks">
        {await Promise.all(
          showcase.blocks.map(async (block, index) => (
            <ShowcaseBlockView key={index} block={block} />
          )),
        )}
      </div>
    </article>
  );
}
