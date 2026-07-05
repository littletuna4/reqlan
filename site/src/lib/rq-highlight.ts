export type RqTokenType =
  | "comment"
  | "keyword"
  | "string"
  | "attribute"
  | "wiki-link"
  | "file-ref"
  | "idea"
  | "body"
  | "brace"
  | "punctuation"
  | "diagram"
  | "plain";

export interface RqToken {
  type: RqTokenType;
  text: string;
  tooltip?: string;
}

const KEYWORD_TOOLTIPS: Record<string, string> = {
  from: "From-import — pull a single idea from another file",
  import: "Namespace import — bring a file's ideas into scope",
  as: "Alias — local name for an imported file or idea",
};

const ATTRIBUTE_TOOLTIPS: Record<string, string> = {
  status: "Workflow state — pending, in-progress, done, etc.",
  tags: "Classification labels for filtering and search",
  references: "Explicit links to related ideas in the graph",
};

const BRACE_TOOLTIPS: Record<string, string> = {
  "{": "Block body — description and attributes",
  "}": "End of block",
  "(": "List or ideaset — comma-separated members",
  ")": "End of list",
};

const IDEA_NAME = /^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)/;

export function tokenizeRq(code: string): RqToken[] {
  const lines = code.split("\n");
  const tokens: RqToken[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex > 0) {
      tokens.push({ type: "plain", text: "\n" });
    }
    tokens.push(...tokenizeLine(lines[lineIndex]));
  }

  return tokens;
}

function tokenizeLine(line: string): RqToken[] {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length);
  const tokens: RqToken[] = [];

  if (indent) {
    tokens.push({ type: "plain", text: indent });
  }

  if (!content) {
    return tokens;
  }

  if (content.startsWith("#") || content.startsWith("//")) {
    tokens.push({
      type: "comment",
      text: content,
      tooltip: "Comment — not part of the requirement",
    });
    return tokens;
  }

  tokens.push(
    ...scanInline(content, {
      atLineStart: true,
      inBlock: indent.length > 0,
      inList: false,
    }),
  );

  return tokens;
}

type ScanContext = {
  atLineStart: boolean;
  inBlock: boolean;
  inList: boolean;
};

function scanInline(text: string, context: ScanContext): RqToken[] {
  const tokens: RqToken[] = [];
  let index = 0;
  let ctx = context;

  while (index < text.length) {
    const remaining = text.slice(index);

    const whitespace = remaining.match(/^\s+/);
    if (whitespace) {
      tokens.push({ type: "plain", text: whitespace[0] });
      index += whitespace[0].length;
      ctx = { ...ctx, atLineStart: false };
      continue;
    }

    const next = scanToken(remaining, ctx);
    if (!next) {
      tokens.push({
        type: ctx.inBlock ? "body" : "plain",
        text: remaining[0],
      });
      index += 1;
      ctx = { ...ctx, atLineStart: false };
      continue;
    }

    tokens.push(next.token);
    index += next.length;

    if (next.token.text === "(") {
      ctx = { ...ctx, inList: true, atLineStart: false };
      continue;
    }

    if (next.token.text === ")") {
      ctx = { ...ctx, inList: false, atLineStart: false };
      continue;
    }

    ctx = { ...ctx, atLineStart: false };
  }

  return tokens;
}

function scanToken(
  text: string,
  context: ScanContext,
): { token: RqToken; length: number } | null {
  const patterns: Array<{
    match: RegExp;
    build: (value: string) => RqToken;
  }> = [
    {
      match: /^(?:→|──►|└──►)/,
      build: (value) => ({
        type: "diagram",
        text: value,
        tooltip: "Navigation or dependency in the graph",
      }),
    },
    {
      match: /^\[\[[^\]]+\]\]/,
      build: (value) => ({
        type: "wiki-link",
        text: value,
        tooltip: "Wikilink — reference another idea in the graph",
      }),
    },
    {
      match: /^\["[^"]+"(?:\.[A-Za-z_][\w.]*)?\]/,
      build: (value) => ({
        type: "file-ref",
        text: value,
        tooltip: value.includes(".")
          ? "Symbol reference — link to a file and code symbol"
          : "File reference — link to a source file",
      }),
    },
    {
      match: /^@\w+/,
      build: (value) => {
        const name = value.slice(1);
        return {
          type: "attribute",
          text: value,
          tooltip:
            ATTRIBUTE_TOOLTIPS[name] ??
            "Attribute — metadata attached to an idea",
        };
      },
    },
    {
      match: /^(from|import|as)\b/,
      build: (value) => ({
        type: "keyword",
        text: value,
        tooltip: KEYWORD_TOOLTIPS[value],
      }),
    },
    {
      match: /^"(?:[^"\\]|\\.)*"/,
      build: (value) => ({
        type: "string",
        text: value,
        tooltip: context.inList
          ? "Ideaset member — quoted idea name"
          : context.atLineStart
            ? "Import path or quoted idea name"
            : "Quoted idea name",
      }),
    },
    {
      match: /^[{}()]/,
      build: (value) => ({
        type: "brace",
        text: value,
        tooltip: BRACE_TOOLTIPS[value],
      }),
    },
    {
      match: /^[:,]/,
      build: (value) => ({
        type: "punctuation",
        text: value,
      }),
    },
    {
      match: IDEA_NAME,
      build: (value) => ideaToken(value, text, context),
    },
    {
      match: /^[A-Za-z_][\w.]*/,
      build: (value) => {
        if (context.inList) {
          return {
            type: "idea",
            text: value,
            tooltip: "Ideaset or list member",
          };
        }

        return {
          type: context.inBlock ? "body" : "plain",
          text: value,
        };
      },
    },
    {
      match: /^[^\s\w"@\[{}\],:→─└]+/,
      build: (value) => ({
        type: context.inBlock ? "body" : "plain",
        text: value,
      }),
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.match);
    if (match) {
      return {
        token: pattern.build(match[0]),
        length: match[0].length,
      };
    }
  }

  return null;
}

function ideaToken(
  value: string,
  text: string,
  context: ScanContext,
): RqToken {
  if (context.inList) {
    return {
      type: "idea",
      text: value,
      tooltip: "Ideaset or list member",
    };
  }

  if (!context.atLineStart) {
    return {
      type: context.inBlock ? "body" : "plain",
      text: value,
    };
  }

  const after = text.slice(value.length);

  if (/^\s*\{/.test(after)) {
    return {
      type: "idea",
      text: value,
      tooltip: "Block idea — name followed by a body in curly braces",
    };
  }

  if (/^\s+\(/.test(after)) {
    return {
      type: "idea",
      text: value,
      tooltip: "Ideaset — groups ideas in a namespace",
    };
  }

  if (/^\s+\S/.test(after) && !/^\s+@/.test(after)) {
    return {
      type: "idea",
      text: value,
      tooltip: "One-liner idea — name and body on the same line",
    };
  }

  return {
    type: "idea",
    text: value,
    tooltip: "Idea name",
  };
}
