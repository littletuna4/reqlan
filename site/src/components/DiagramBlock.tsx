import { tokenizeDiagram } from "@/lib/diagram-highlight";

type DiagramBlockProps = {
  content: string;
  className?: string;
};

export function DiagramBlock({ content, className }: DiagramBlockProps) {
  const tokens = tokenizeDiagram(content);
  const preClass = className
    ? `${className} diagram-block`
    : "diagram-block";

  return (
    <pre className={preClass} aria-label="Diagram">
      <code className="diagram-code">
        {tokens.map((token, index) => (
          <span key={index} className={`diagram-${token.type}`}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
