export type NavItem = {
  id: string;
  label: string;
  href?: string;
};

export type SyntaxSnippet = {
  label?: string;
  code: string;
  language: CodeLanguage;
};

export type SyntaxExample = {
  label: string;
  /** Self-referential form — the snippet teaches the rule. */
  rule: SyntaxSnippet;
  /** Applied use; revealed by a toggle. */
  practical: SyntaxSnippet;
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

export type MotivationFeature = {
  id: string;
  label: string;
  /** Concrete capability. */
  what: string;
  /** Why that capability matters. */
  why: string;
};

export type MotivationSlide = {
  id: string;
  label: string;
  /** What this part of reqlan is. */
  what: string;
  /** Why this part exists. */
  why: string;
  features: MotivationFeature[];
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

export type RoadmapItem = {
  id: string;
  horizon: "Now" | "Next" | "Later";
  label: string;
  detail: string;
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
    { id: "roadmap", label: "Roadmap" },
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
      { id: "example", label: "Example", kind: "section", target: "example", x: 34, y: 82 },
      { id: "roadmap", label: "Roadmap", kind: "section", target: "roadmap", x: 54, y: 86 },
      { id: "contact", label: "Links", kind: "section", target: "contact", x: 72, y: 74 },
      { id: "quickstart", label: "Start", kind: "page", target: "/quickstart", x: 78, y: 20 },
      { id: "tutorials", label: "Learn", kind: "page", target: "/tutorials", x: 90, y: 46 },
      { id: "showcase", label: "Shows", kind: "page", target: "/showcase", x: 80, y: 56 },
    ] satisfies NavGraphNode[],
    edges: [
      { from: "hero", to: "motivation" },
      { from: "motivation", to: "syntax" },
      { from: "syntax", to: "example" },
      { from: "example", to: "roadmap" },
      { from: "roadmap", to: "contact" },
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
    title: "What is reqlan?",
    lead: "A token efficient language for writing named-linked-tagged functional requirments — plus an editor extension and a CLI on the same index. Engineers who wrangle complexity use it so they can write the alpha once and stop re-explaining the system every sprint.",
    slides: [
      {
        id: "language",
        label: "Language",
        what: "`.rq` files: a name, a short body, links to ideas, code, and tests.",
        why: "You write the alpha. Everything else points back to it. No more hunting the “real” rule in a six-month-old chat.",
        features: [
          {
            id: "named-ideas",
            label: "Names",
            what: "`auth.login` beats “that password thing from the deck.”",
            why: "Handles survive threads. Paragraphs don't.",
          },
          {
            id: "links",
            label: "Links",
            what: "Ideas cite other ideas, source files, and tests.",
            why: "Ask “what depends on this?” and get an answer, not a wiki hike.",
          },
          {
            id: "attributes",
            label: "Status",
            what: "`@status`, `@todo`, `@tests` sit next to the prose.",
            why: "Status lives with the requirement. Not in a sheet nobody opens.",
          },
        ],
      },
      {
        id: "extension",
        label: "Extension",
        what: "VS Code / Cursor: language server, graph views, agent hooks — one `.reqlan` index.",
        why: "Complexity shows up where you already type. Catch dead links before review does.",
        features: [
          {
            id: "lsp",
            label: "LSP",
            what: "Go-to-def, find refs, validation on `.rq`.",
            why: "A red squiggle today beats a surprised PM tomorrow.",
          },
          {
            id: "graph-views",
            label: "Graph",
            what: "Ideas Summary and a neighbourhood scoped to the file you have open.",
            why: "You need the slice in front of you — not the whole galaxy.",
          },
          {
            id: "agent-hooks",
            label: "Agents",
            what: "@reqlan chat, MCP tools, rq-* skills.",
            why: "Feed the model six linked ideas. Not forty files of noise.",
          },
        ],
      },
      {
        id: "cli",
        label: "CLI",
        what: "`reqlan` / `rq` — search, analyse, export. Same index as the extension.",
        why: "Terminals and CI ask the editor's questions. No twin database to drift.",
        features: [
          {
            id: "search",
            label: "Search",
            what: "`reqlan search oauth` hits the workspace index.",
            why: "Scripts get the same ranked ideas your IDE shows.",
          },
          {
            id: "analyse",
            label: "Analyse",
            what: "`reqlan analyse` rebuilds and checks the graph.",
            why: "Broken refs fail the pipeline, not the demo.",
          },
          {
            id: "export",
            label: "Export",
            what: "HTML, JSON, Markdown or CSV from the live graph.",
            why: "Handoffs ship what you see now — not last quarter's export.",
          },
        ],
      },
    ] satisfies MotivationSlide[],
  },

  syntax: {
    title:"How are ideas actually written",
    lead: "reqlan is super easy to learn, here's a few self explanatory examples.",
    examples: [
      {
        label: "one-liner",
        rule: {
          language: "rq",
          code: `one_line_idea an idea is prose after an identifying name`,
        },
        practical: {
          label: "auth.rq",
          language: "rq",
          code: `login must reject empty passwords
logout clears the active session cookie
password_reset emails a one-time link`,
        },
      },
      {
        label: "block",
        rule: {
          language: "rq",
          code: `block_idea {
    A name followed by curly braces holds a longer body and optional attributes.
    The first unmarked text is the main description.
}`,
        },
        practical: {
          label: "session.rq",
          language: "rq",
          code: `session_expiry {
    tokens die after inactivity
    refresh must not resurrect a revoked session
    idle timeout is 30 minutes for interactive clients
}`,
        },
      },
      {
        label: "links & attributes",
        rule: {
          language: "rq",
          code: `reference_target a named idea other ideas can point at

links_and_attributes {
    Bracket refs like [reference_target] connect ideas in the graph.
    @status draft
    @tags (syntax, reference)
}`,
        },
        practical: {
          label: "session.rq",
          language: "rq",
          code: `session_expiry tokens die after inactivity

session_refresh {
    rotates on use — aligns with [session_expiry]
    @status pending
    @tags (auth, security)
    @todo reject reuse of the old refresh token
}`,
        },
      },
      {
        label: "imports",
        rule: {
          language: "rq",
          code: `import "pythonmodule.py" as importable_python_module

imports {
    You can import [importable_python_module] — arbitrary files, not only .rq.
}`,
        },
        practical: {
          label: "surface.rq",
          language: "rq",
          code: `from "auth.rq" import login
import "./session.rq" as session

auth_surface (login, session.session_expiry, session.session_refresh)`,
        },
      },
      {
        label: "file refs",
        rule: {
          language: "rq",
          code: `file_reference {
    Point at a whole file ["./module.py"], a symbol ["./module.py".SessionStore],
    or a named test ["./module.test.py:rejects expired token"].
}`,
        },
        practical: {
          label: "session.rq",
          language: "rq",
          code: `session_expiry {
    expired tokens must reject requests
    implemented in ["./src/auth/session.ts".validateSession]
    proven by ["./src/auth/session.test.ts:rejects expired access token"]
    @status verified
}`,
        },
      },
      {
        label: "typescript",
        rule: {
          language: "ts",
          code: `// rq:["./syntax.rq".comment_reference]
// An rq: comment in TypeScript pins this location back to an idea.`,
        },
        practical: {
          label: "auth.test.ts",
          language: "ts",
          code: `// rq:["./expiry.rq".session_expiry]
test("rejects expired access token", async () => {
  const res = await request(app)
    .get("/me")
    .set("Authorization", \`Bearer \${expired}\`);
  expect(res.status).toBe(401);
});`,
        },
      },
      {
        label: "markdown",
        rule: {
          language: "md",
          code: `<!-- rq:["./syntax.rq".comment_reference] -->
An \`rq:\` comment in Markdown pins this doc back to an idea.`,
        },
        practical: {
          label: "docs/deploy.md",
          language: "md",
          code: `<!-- rq:["./ops.rq".release_pipeline] -->
# Deployment

Cut a release from \`.github/workflows/release.yml\`.
Promote only after staging smoke passes.`,
        },
      },
      {
        label: "python",
        rule: {
          language: "py",
          code: `# rq:["./syntax.rq".comment_reference]
# An rq: comment in Python pins this location back to an idea.`,
        },
        practical: {
          label: "session_store.py",
          language: "py",
          code: `# rq:["./session.rq".session_store]
class SessionStore:
    def validate(self, token: str) -> bool:
        return not self.is_expired(token)`,
        },
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

  roadmap: {
    title: "Roadmap",
    lead: "A short list. Scroll for the next one.",
    items: [
      {
        id: "context",
        horizon: "Now",
        label: "Context that decides",
        detail: "Activity-bar signals for the next move — not just where a file came from.",
      },
      {
        id: "search",
        horizon: "Next",
        label: "Search in context",
        detail: "Rank matches from the ideas and files you already have open.",
      },
      {
        id: "rank",
        horizon: "Next",
        label: "Rank the neighbourhood",
        detail: "Pagerank and multi-seed distance so agents get the right slice.",
      },
      {
        id: "git",
        horizon: "Later",
        label: "Idea git history",
        detail: "CodeLens timeline on an idea — relative dates, moves included.",
      },
      {
        id: "walk",
        horizon: "Later",
        label: "How the graph is walked",
        detail: "Remember traversal patterns; recommend better next hops.",
      },
    ] satisfies RoadmapItem[],
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
