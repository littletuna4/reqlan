import type { HighlightKey } from "@/generated/highlights";
import { getHighlight } from "@/generated/highlights";
import { RqCode } from "@/components/RqCode";
import type { CodeLanguage } from "@/content/site";
import { cn } from "@/lib/utils";
import styles from "./CodeBlock.module.css";

type CodeBlockProps = {
  language: CodeLanguage;
  content: string;
  highlightKey?: HighlightKey;
  className?: string;
};

export function CodeBlock({
  language,
  content,
  highlightKey,
  className,
}: CodeBlockProps) {
  if (language === "rq") {
    return <RqCode code={content} className={className} />;
  }

  if (!highlightKey) {
    throw new Error(`CodeBlock requires highlightKey for ${language}`);
  }

  const html = getHighlight(highlightKey);
  const blockClass = cn(styles.block, className);

  return (
    <div className={blockClass} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
