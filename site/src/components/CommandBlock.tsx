type CommandBlockProps = {
  content: string;
  className?: string;
};

function CommandLine({ line }: { line: string }) {
  const palette = line.match(/^([^:]+):\s*(.+)$/);
  if (palette) {
    return (
      <>
        <span className="command-category">{palette[1]}</span>
        <span className="command-sep">: </span>
        <span className="command-name">{palette[2]}</span>
      </>
    );
  }

  const slash = line.match(/^(\/\S+)(?:\s+(.*))?$/);
  if (slash) {
    return (
      <>
        <span className="command-slash">{slash[1]}</span>
        {slash[2] ? <span className="command-args"> {slash[2]}</span> : null}
      </>
    );
  }

  return <span className="command-name">{line}</span>;
}

export function CommandBlock({ content, className }: CommandBlockProps) {
  const lines = content.split("\n").filter((line) => line.length > 0);
  const blockClass = className
    ? `${className} command-block`
    : "command-block";

  return (
    <div className={blockClass} aria-label="Commands">
      {lines.map((line) => (
        <div key={line} className="command-line">
          <span className="command-prefix" aria-hidden="true">
            ›
          </span>
          <code className="command-code">
            <CommandLine line={line} />
          </code>
        </div>
      ))}
    </div>
  );
}
