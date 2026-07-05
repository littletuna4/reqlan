import { CommandBlock } from "@/components/CommandBlock";
import { DiagramBlock } from "@/components/DiagramBlock";
import { RqCode } from "@/components/RqCode";
import type { BlockKind } from "@/content/site";

type CodeBlockProps = {
  kind: BlockKind;
  content: string;
  className?: string;
};

export function CodeBlock({ kind, content, className }: CodeBlockProps) {
  switch (kind) {
    case "diagram":
      return <DiagramBlock content={content} className={className} />;
    case "commands":
      return <CommandBlock content={content} className={className} />;
    default:
      return <RqCode code={content} className={className} />;
  }
}
