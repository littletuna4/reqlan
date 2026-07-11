import Link from "next/link";
import type { Showcase } from "@/content/showcases";

type ShowcaseCardProps = {
  showcase: Showcase;
};

export function ShowcaseCard({ showcase }: ShowcaseCardProps) {
  return (
    <article className="showcase-card">
      <div className="showcase-card-tags">
        {showcase.tags.map((tag) => (
          <span key={tag} className="showcase-tag">
            {tag}
          </span>
        ))}
      </div>

      <h2 className="showcase-card-title">
        <Link href={`/showcase/${showcase.id}`}>{showcase.title}</Link>
      </h2>

      <p className="showcase-card-summary">{showcase.summary}</p>

      <Link href={`/showcase/${showcase.id}`} className="showcase-card-link">
        View showcase
      </Link>
    </article>
  );
}
