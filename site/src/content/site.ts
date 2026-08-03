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

import {
  phonebookLinks,
  phonebookPackages,
  type PhonebookLink,
  type PhonebookPackage,
} from "@/lib/phonebook";

export type LinkItem = PhonebookLink;
export type PackageItem = PhonebookPackage;

export type CodeLanguage = "rq" | "ts" | "md" | "py" | "st" | "c" | "json" | "yaml";

export type MotivationTab = {
  id: string;
  label: string;
  pitch?: string;
  code?: string;
  language?: CodeLanguage;
  features?: string[];
};

export type NavGraphNodeKind = "hub" | "section" | "page";

export type NavGraphNode = {
  id: string;
  label: string;
  kind: NavGraphNodeKind;
  /** Section anchor id when kind is hub/section; page path when kind is page. */
  target: string;
  /** Initial layout in viewBox units (0–100). */
  x: number;
  y: number;
};

export type NavGraphEdge = {
  from: string;
  to: string;
};

export const siteContent = {
  meta: {
    title: "reqlan",
    description:
      "Markdown on steroids for requirements — Obsidian meets Dendron meets the IDE. A graph of named ideas your agents can search, link, and reuse.",
  },

  brand: {
    name: "reqlan",
  },

  nav: [
    { id: "quickstart", label: "Get started", href: "/quickstart" },
    { id: "tutorials", label: "Tutorials", href: "/tutorials" },
    { id: "motivation", label: "Why reqlan" },
    { id: "syntax", label: "Syntax" },
    { id: "example", label: "Example" },
    { id: "showcase", label: "Showcases", href: "/showcase" },
    { id: "spec", label: "Spec", href: "/spec" },
    { id: "contact", label: "Links" },
  ] satisfies NavItem[],

  navGraph: {
    label: "Page graph",
    nodes: [
      { id: "hero", label: "reqlan", kind: "hub", target: "hero", x: 50, y: 42 },
      { id: "motivation", label: "Why", kind: "section", target: "motivation", x: 22, y: 26 },
      { id: "syntax", label: "Syntax", kind: "section", target: "syntax", x: 16, y: 58 },
      { id: "example", label: "Example", kind: "section", target: "example", x: 38, y: 82 },
      { id: "contact", label: "Links", kind: "section", target: "contact", x: 68, y: 78 },
      { id: "quickstart", label: "Start", kind: "page", target: "/quickstart", x: 78, y: 20 },
      { id: "tutorials", label: "Learn", kind: "page", target: "/tutorials", x: 90, y: 46 },
      { id: "showcase", label: "Shows", kind: "page", target: "/showcase", x: 74, y: 56 },
    ] satisfies NavGraphNode[],
    edges: [
      { from: "hero", to: "motivation" },
      { from: "motivation", to: "syntax" },
      { from: "syntax", to: "example" },
      { from: "example", to: "contact" },
      { from: "hero", to: "contact" },
      { from: "hero", to: "quickstart" },
      { from: "hero", to: "tutorials" },
      { from: "hero", to: "showcase" },
    ] satisfies NavGraphEdge[],
  },

  hero: {
    snippet: `reqlan {
    semantic *engineering* toolset
}`,
  },

  cta: {
    label: "Get started",
    href: "/quickstart",
  },

  motivation: {
    title: "Why reqlan",
    lead: "Notes apps store paragraphs. reqlan stores handles — requirements as code, built for LLM workflows.",
    tabs: [
      {
        id: "llm-first",
        label: "Built for agents",
        pitch:
          "Six ideas and their edges beat forty files. Hand the agent a shaped slice — never the whole repo.",
        language: "rq",
        code: `# /rq-search oauth flow
→ auth.login
→ auth.session
→ auth.logout

# not: dump the whole workspace`,
      },
      {
        id: "traceable",
        label: "Trace everything",
        pitch:
          "Name the idea. Point at the code. Prove it with a test. Hop the graph like a signal path.",
        language: "rq",
        code: `login {
    rejects empty passwords
    aligns with [auth.session]
    implemented in ["./auth.ts".login]
    proven by ["./auth.test.ts:rejects empty password"]
    @status done
}`,
      },
      {
        id: "any-stack",
        label: "Any stack",
        pitch:
          "Software, ops, industrial control, personal knowledge — if you can name it, you can graph it.",
        language: "rq",
        code: `safety_interlock {
    valve must close before heater enables
    bound to ["./plc/safety.st".INTERLOCK]
    @tags: (iec-61131, critical)
}`,
      },
      {
        id: "extension-editor",
        label: "In the editor",
        pitch: "A real language server for `.rq` — and `rq:` hooks in every other file.",
        language: "rq",
        features: [
          "LSP — go-to-def, find refs, validation, semantic tokens",
          "Inlay hints, hover, and completion for imports and links",
          "rq: references in comments of any source file",
          "CodeLens on references with classification cards",
        ],
        code: `auth.login ──► session.rq:12
              └──► [auth.logout]
# rq:["./auth.rq".login]`,
      },
      {
        id: "extension-workspace",
        label: "See the graph",
        pitch:
          "Ideas Summary, neighbourhood context, and exports that share one `.reqlan` index with the CLI.",
        language: "md",
        features: [
          "Ideas Summary — tables plus a live Obsidian-style graph",
          "Activity-bar neighbourhood scoped to file or selection",
          "Semantic search across the base",
          "Export HTML site, JSON, or CSV — same index as `reqlan` / `rq` CLI",
        ],
        code: `Reqlan: Ideas Summary
Reqlan: Semantic Search
Reqlan: Get Local Graph
Reqlan: Export HTML
$ reqlan search oauth
$ reqlan export`,
      },
      {
        id: "extension-ai",
        label: "Talk to it",
        pitch:
          "@reqlan in chat, MCP tools for agents, rq-* skills for Cursor and Copilot — token discipline by default.",
        language: "md",
        features: [
          "@reqlan chat participant with #requirement / #file tools",
          "MCP — search, file context, local graph",
          "rq-* skills: search, build requirement, add to context, write plan",
          "Install Cursor skills from the command palette",
        ],
        code: `/rq-search oauth
/rq-build-requirement
/rq-add-to-context
/rq-write-plan`,
      },
    ] satisfies MotivationTab[],
  },

  syntax: {
    title: "Write it like you mean it",
    lead: "One-liners when you're fast. Blocks when you need depth. Wikilinks, imports, and attributes when the graph grows.",
    examples: [
      {
        label: "one-liner",
        language: "rq",
        code: `login must reject empty passwords`,
      },
      {
        label: "block",
        language: "rq",
        code: `session_expiry {
    tokens die after inactivity
    refresh must not resurrect a revoked session
}`,
      },
      {
        label: "links & attributes",
        language: "rq",
        code: `session_refresh {
    rotates on use — aligns with [session_expiry]
    @status: pending
    @tags: (auth, security)
}`,
      },
      {
        label: "imports",
        language: "rq",
        code: `from "auth.rq" import login
import "./session.rq"

auth_surface (login, session_expiry, session_refresh)`,
      },
      {
        label: "file refs",
        language: "rq",
        code: `["./src/auth/session.ts"]
["./src/auth/session.ts".validateSession]
["./src/auth/session.test.ts:rejects expired access token"]`,
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
        code: `class SessionStore:
    def validate(self, token: str) -> bool:
        return not self.is_expired(token)`,
      },
    ] satisfies SyntaxExample[],
  },

  example: {
    title: "A slice of a real graph",
    lead: "Imports, file anchors, wikilinks, status, tags, and tests — one idea that tools can find.",
    code: `from "auth.rq" import login
import "./session.rq" as session

session_refresh {
    refresh tokens rotate on use
    aligns with [session.session_expiry] and [login]
    implemented in ["./src/auth/session.ts".rotateRefresh]
    proven by ["./src/auth/session.test.ts:rejects reused refresh token"]

    @status: in-progress
    @tags: (auth, security)
    @todo: reject reuse of the old refresh token
}`,
  },

  contact: {
    title: "Go deeper",
    packagesTitle: "Packages",
    links: phonebookLinks satisfies LinkItem[],
    packages: phonebookPackages satisfies PackageItem[],
  },

  footer: {
    copyright: "reqlan",
  },
} as const;

export type SiteContent = typeof siteContent;
