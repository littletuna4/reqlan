export type DiagramTokenType =
  | "comment"
  | "connector"
  | "node"
  | "location"
  | "ref"
  | "plain";

export interface DiagramToken {
  type: DiagramTokenType;
  text: string;
}

export function tokenizeDiagram(code: string): DiagramToken[] {
  const lines = code.split("\n");
  const tokens: DiagramToken[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex > 0) {
      tokens.push({ type: "plain", text: "\n" });
    }
    tokens.push(...tokenizeDiagramLine(lines[lineIndex]));
  }

  return tokens;
}

function tokenizeDiagramLine(line: string): DiagramToken[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return [{ type: "comment", text: line }];
  }

  const tokens: DiagramToken[] = [];
  let index = 0;

  while (index < line.length) {
    const remaining = line.slice(index);

    const whitespace = remaining.match(/^\s+/);
    if (whitespace) {
      tokens.push({ type: "plain", text: whitespace[0] });
      index += whitespace[0].length;
      continue;
    }

    const connector = remaining.match(/^(?:→|──►|└──►)/);
    if (connector) {
      tokens.push({ type: "connector", text: connector[0] });
      index += connector[0].length;
      continue;
    }

    const ref = remaining.match(/^\[[^\]]+\]/);
    if (ref) {
      tokens.push({ type: "ref", text: ref[0] });
      index += ref[0].length;
      continue;
    }

    const location = remaining.match(/^[A-Za-z_][\w.]*:\d+/);
    if (location) {
      tokens.push({ type: "location", text: location[0] });
      index += location[0].length;
      continue;
    }

    const node = remaining.match(/^[A-Za-z_][\w.]+/);
    if (node) {
      tokens.push({ type: "node", text: node[0] });
      index += node[0].length;
      continue;
    }

    tokens.push({ type: "plain", text: remaining[0] });
    index += 1;
  }

  return tokens;
}
