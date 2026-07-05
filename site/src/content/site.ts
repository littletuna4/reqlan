export type NavItem = {
  id: string;
  label: string;
};

export type SyntaxExample = {
  label: string;
  code: string;
};

export type LinkItem = {
  label: string;
  href: string;
};

export type BlockKind = "rq" | "diagram" | "commands";

export type MotivationTab = {
  id: string;
  label: string;
  code?: string;
  blockKind?: BlockKind;
  features?: string[];
};

export const siteContent = {
  meta: {
    title: "reqlan",
    description: "Semantic requirements as code.",
  },

  brand: {
    name: "reqlan",
  },

  nav: [
    { id: "motivation", label: "Motivation" },
    { id: "syntax", label: "Syntax" },
    { id: "example", label: "Example" },
    { id: "contact", label: "Links" },
  ] satisfies NavItem[],

  hero: {
    snippet: `auth {
    login must use oauth
    @status: in-progress
}`,
  },

  cta: {
    label: "Install extension",
    href: "https://marketplace.visualstudio.com/items?itemName=btdigital.vscode-reqlan-extension",
  },

  motivation: {
    tabs: [
      {
        id: "llm-first",
        label: "LLM-first",
        blockKind: "diagram",
        code: `# /rq-search oauth flow
→ auth.login
→ auth.session
→ auth.logout

# not: dump the whole repo`,
      },
      {
        id: "traceable",
        label: "Traceable",
        blockKind: "rq",
        code: `login {
    aligns with [auth.session]
    implemented in ["./auth.ts".login]
}`,
      },
      {
        id: "any-stack",
        label: "Any stack",
        blockKind: "rq",
        code: `safety_interlock {
    valve must close before heater enables
    @tags: (iec-61131, critical)
}`,
      },
      {
        id: "extension-editor",
        label: "Editor",
        blockKind: "diagram",
        features: [
          "LSP for .rq — go-to-def, find refs, validation",
          "Syntax highlighting and semantic tokens",
          "Inlay hints and hover on ideas and links",
          "Completion for imports, references, and search",
          "rq: references in comments of any source file",
        ],
        code: `auth.login ──► session.rq:12
              └──► [auth.logout]`,
      },
      {
        id: "extension-workspace",
        label: "Workspace",
        blockKind: "commands",
        features: [
          "Ideas and references tables",
          "Graph view — filter by file, tag, or status",
          "Local graph scoped to file or selection",
          "Export graph to JSON or CSV",
        ],
        code: `Reqlan: List All Ideas
Reqlan: Get Local Graph
Reqlan: Export JSON`,
      },
      {
        id: "extension-ai",
        label: "AI",
        blockKind: "commands",
        features: [
          "@reqlan chat participant in VS Code / Copilot",
          "MCP — search, file context, local graph",
          "rq-* skills for Cursor and Copilot",
          "Build requirement, add to context, write plan",
        ],
        code: `/rq-search oauth
/rq-build-requirement
/rq-add-to-context`,
      },
    ] satisfies MotivationTab[],
  },

  syntax: {
    examples: [
      {
        label: "one-liner",
        code: `my_idea ideas support one liners`,
      },
      {
        label: "block",
        code: `myidea {
    It should be a good thing.
}`,
      },
      {
        label: "links & attributes",
        code: `"my idea2" {
    compatible with [myidea]
    @status: pending
    @tags: (todo, highpriority)
}`,
      },
      {
        label: "imports",
        code: `from "main.rq" import myidea
import "./exampleimport.rq"

my_ideaset (myidea, "my idea2")`,
      },
      {
        label: "file refs",
        code: `["./apythonfile.py"]
["./apythonfile.py".APythonClass.say_hello]`,
      },
    ] satisfies SyntaxExample[],
  },

  example: {
    code: `from "main.rq" import myidea
import "./exampleimport.rq"
import "exampleimport2.rq" as exampleimport2

myidea3 {
    application must have something. this should align with [myidea]
    and also with ["./exampleimport.rq".myimportableIdea]

    @tags: (style, accessibility, performance)
    @references: ({ [exampleimport2.myimportableIdea] })
}`,
  },

  contact: {
    links: [
      {
        label: "Extension",
        href: "https://marketplace.visualstudio.com/items?itemName=btdigital.vscode-reqlan-extension",
      },
      {
        label: "GitHub",
        href: "https://github.com/littletuna4/reqlan",
      },
      {
        label: "Email",
        href: "mailto:reqlan@tony.is-a.dev",
      },
    ] satisfies LinkItem[],
  },

  footer: {
    copyright: "reqlan",
  },
} as const;

export type SiteContent = typeof siteContent;
