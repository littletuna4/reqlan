import { RqCode } from "@/components/RqCode";
import type { CodeLanguage } from "@/content/site";
import { highlightCode } from "@/lib/highlight";

type CodeBlockProps = {
  language: CodeLanguage;
  content: string;
  className?: string;
};

export async function CodeBlock({
  language,
  content,
  className,
}: CodeBlockProps) {
  if (language === "rq") {
    return <RqCode code={content} className={className} />;
  }

  const html = await highlightCode(content, language);
  const blockClass = [
    "code-block",
    `language-${language}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={blockClass}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
