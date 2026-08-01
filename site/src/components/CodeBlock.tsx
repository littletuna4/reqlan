import { highlights, type HighlightKey } from "@/generated/highlights";
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

  const html = highlights[highlightKey];
  if (typeof html !== "string") {
    throw new Error(
      `Missing highlight for key "${String(highlightKey)}" (language=${language}). Run generate-highlights.`,
    );
  }

  const blockClass = cn(styles.block, className);

  // Avoid spreading a dynamic object — React 19 is strict about the shape.
  return (
    <div
      className={blockClass}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
}
