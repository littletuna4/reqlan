export type NavItem = {
  id: string;
  label: string;
  href?: string;
};

export type SyntaxExample = {
  label: string;
  code: string;
  language: CodeLanguage;
};

import { phonebookLinks, type PhonebookLink } from "@/lib/phonebook";

export type LinkItem = PhonebookLink;

export type CodeLanguage = "rq" | "ts" | "md" | "py";

export type MotivationTab = {
  id: string;
  label: string;
  code?: string;
  language?: CodeLanguage;
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
    { id: "quickstart", label: "Get started", href: "/quickstart" },
    { id: "motivation", label: "Motivation" },
    { id: "syntax", label: "Syntax" },
    { id: "example", label: "Example" },
    { id: "showcase", label: "Showcases", href: "/showcase" },
    { id: "contact", label: "Links" },
  ] satisfies NavItem[],

  hero: {
    snippet: `auth {
    login must use oauth
    @status: in-progress
}`,
  },

  cta: {
    label: "Get started",
    href: "/quickstart",
  },

  motivation: {
    tabs: [
      {
        id: "llm-first",
        label: "LLM-first",
        language: "rq",
        code: `# /rq-search oauth flow
→ auth.login
→ auth.session
→ auth.logout

# not: dump the whole repo`,
      },
      {
        id: "traceable",
        label: "Traceable",
        language: "rq",
        code: `login {
    aligns with [auth.session]
    implemented in ["./auth.ts".login]
}`,
      },
      {
        id: "any-stack",
        label: "Any stack",
        language: "rq",
        code: `safety_interlock {
    valve must close before heater enables
    @tags: (iec-61131, critical)
}`,
      },
      {
        id: "extension-editor",
        label: "Editor",
        language: "rq",
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
        language: "md",
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
        language: "md",
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
        language: "rq",
        code: `my_idea ideas support one liners`,
      },
      {
        label: "block",
        language: "rq",
        code: `myidea {
    It should be a good thing.
}`,
      },
      {
        label: "links & attributes",
        language: "rq",
        code: `"my idea2" {
    compatible with [myidea]
    @status: pending
    @tags: (todo, highpriority)
}`,
      },
      {
        label: "imports",
        language: "rq",
        code: `from "main.rq" import myidea
import "./exampleimport.rq"

my_ideaset (myidea, "my idea2")`,
      },
      {
        label: "file refs",
        language: "rq",
        code: `["./apythonfile.py"]
["./apythonfile.py".APythonClass.say_hello]`,
      },
      {
        label: "typescript",
        language: "ts",
        code: `export async function login(req: Request) {
  const token = await oauth.verify(req);
  return createSession(token);
}`,
      },
      {
        label: "markdown",
        language: "md",
        code: `# Deployment

See workflow in \`.github/workflows/release.yml\`.`,
      },
      {
        label: "python",
        language: "py",
        code: `class APythonClass:
    def say_hello(self) -> None:
        print("hello")`,
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
    links: phonebookLinks satisfies LinkItem[],
  },

  footer: {
    copyright: "reqlan",
  },
} as const;

export type SiteContent = typeof siteContent;
