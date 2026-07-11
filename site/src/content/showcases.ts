import type { CodeLanguage } from "@/content/site";

export type ShowcaseBlock =
  | {
      language: CodeLanguage;
      code: string;
      label?: string;
    }
  | {
      kind: "features";
      label?: string;
      items: string[];
    };

export type Showcase = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  blocks: ShowcaseBlock[];
};

export const showcases = [
  {
    id: "control-system-sequencing",
    title: "Control system sequencing",
    summary:
      "Interlock and phase logic expressed as requirements — semantics, not just ladder rungs.",
    tags: ["industrial", "safety", "sequencing"],
    blocks: [
      {
        language: "rq",
        label: "sequencer",
        code: `startup_sequence {
    valve must close before heater enables
    pressure must reach setpoint before valve opens
    aligns with [safety_interlock]
    @tags: (iec-61131, critical)
    @status: verified
}`,
      },
      {
        language: "rq",
        code: `idle ──► preheat ──► pressurize ──► run
         │                    │
         └── [safety_interlock] ◄───┘`,
      },
    ],
  },
  {
    id: "glue-semantics",
    title: "Glue semantics",
    summary:
      "Requirements that explain how one file relates to another without importing implementation details.",
    tags: ["architecture", "files"],
    blocks: [
      {
        language: "rq",
        code: `api_glue {
    ["./handlers/auth.ts"] implements [auth.login]
    ["./middleware/session.ts"] must run before handlers
    consumers see only ["./api/routes.ts"]
}`,
      },
      {
        language: "ts",
        label: "handlers/auth.ts",
        code: `export async function login(req: Request) {
  const token = await oauth.verify(req);
  return createSession(token);
}`,
      },
    ],
  },
  {
    id: "module-interface",
    title: "Module interface requirements",
    summary:
      "A boundary file that links modules without pulling in their internals.",
    tags: ["modularity", "imports"],
    blocks: [
      {
        language: "rq",
        code: `import "../billing/interface.rq" as billing
import "../auth/interface.rq" as auth

checkout {
    must call [billing.charge] after [auth.session] is valid
    @references: ({ [billing.refund_policy] })
}`,
      },
    ],
  },
  {
    id: "agentic-planning",
    title: "Agentic planning",
    summary:
      "Plans and build steps linked back to requirements the agent should satisfy.",
    tags: ["ai", "planning"],
    blocks: [
      {
        language: "rq",
        code: `oauth_flow_plan {
    @plan: |
      1. Add [auth.login] handler
      2. Wire [auth.session] middleware
      3. Verify against [auth.logout]
    @status: in-progress
}`,
      },
      {
        language: "md",
        code: `/rq-write-plan oauth flow
/rq-build-requirement auth.session`,
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance mapping",
    summary: "Trace controls to standards and show coverage in the graph.",
    tags: ["compliance", "audit"],
    blocks: [
      {
        language: "rq",
        code: `"SOC2 access control" {
    login must use oauth
    session timeout aligns with [security.session_policy]
    @tags: (soc2, cc6.1)
    @status: verified
}`,
      },
    ],
  },
  {
    id: "scattered-docs",
    title: "Scattered docs references",
    summary:
      "Hardcoded doc strings across the repo, unified by semantic search and refs.",
    tags: ["docs", "discovery"],
    blocks: [
      {
        language: "rq",
        code: `deployment_notes {
    see also ["./README.md"]
    workflow in ["./.github/workflows/release.yml"]
    @tags: (docs, ops)
}`,
      },
      {
        language: "md",
        label: "README.md",
        code: `# Deployment

See workflow in \`.github/workflows/release.yml\`.`,
      },
      {
        language: "rq",
        code: `# /rq-search deployment
→ deployment_notes
→ ["./README.md"]
→ ["./.github/workflows/release.yml"]`,
      },
    ],
  },
  {
    id: "feature-tracking",
    title: "Feature implementation tracking",
    summary: "Status and file refs show what is done, in progress, or missing.",
    tags: ["tracking", "status"],
    blocks: [
      {
        language: "rq",
        code: `dark_mode {
    toggle persists in local storage
    implemented in ["./src/theme.ts".applyTheme]
    @status: done
    @tags: (ui, accessibility)
}`,
      },
      {
        language: "ts",
        label: "src/theme.ts",
        code: `export function applyTheme(mode: "light" | "dark") {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem("theme", mode);
}`,
      },
    ],
  },
  {
    id: "test-explanation",
    title: "Test explanation",
    summary:
      "Tests linked to what they prove — semantics above assertion strings.",
    tags: ["testing", "traceability"],
    blocks: [
      {
        language: "rq",
        code: `session_expiry {
    expired tokens must reject requests
    proven by ["./auth.test.ts".rejectsExpiredToken]
}`,
      },
      {
        language: "ts",
        label: "auth.test.ts",
        code: `test("rejectsExpiredToken", async () => {
  const res = await request(app)
    .get("/me")
    .set("Authorization", \`Bearer \${expired}\`);
  expect(res.status).toBe(401);
});`,
      },
      {
        kind: "features",
        label: "what the test proves",
        items: [
          "Expired JWT returns 401",
          "Refresh flow is not attempted for expired access tokens",
        ],
      },
    ],
  },
  {
    id: "arbitrary-attributes",
    title: "Arbitrary attributes",
    summary: "Custom @fields carry domain metadata without changing core syntax.",
    tags: ["attributes", "extensibility"],
    blocks: [
      {
        language: "rq",
        code: `valve_control {
    @owner: process-team
    @priority: P1
    @reviewed: 2026-03-01
    @tags: (safety, plc)
}`,
      },
    ],
  },
  {
    id: "static-connection",
    title: "Static cross-system links",
    summary:
      "Connect dependent but unrelated systems — firmware timing and backend SLA.",
    tags: ["integration", "cross-stack"],
    blocks: [
      {
        language: "rq",
        code: `sensor_sample_rate {
    device samples at 10 Hz per ["./firmware/adc.c".sampleLoop]
}

api_ingest {
    backend must accept bursts within 50 ms per ["./api/ingest.ts"]
    aligns with [sensor_sample_rate]
}`,
      },
      {
        language: "ts",
        label: "api/ingest.ts",
        code: `export async function ingestBatch(events: Event[]) {
  const deadline = Date.now() + 50;
  await queue.push(events, { deadline });
}`,
      },
    ],
  },
  {
    id: "todo-triage",
    title: "Todo triage",
    summary: "Catch an idea in context and route it into tracked work.",
    tags: ["workflow", "triage"],
    blocks: [
      {
        language: "rq",
        code: `"rate limit headers" {
    return Retry-After on 429
    @status: pending
    @tags: (todo, api)
}`,
      },
      {
        language: "md",
        code: `/rq-build-requirement rate limit headers
Reqlan: List All Ideas`,
      },
    ],
  },
  {
    id: "docs-attribute",
    title: "@docs attribute",
    summary: "Link requirements to markdown or exported HTML wiki pages.",
    tags: ["docs", "attributes"],
    blocks: [
      {
        language: "rq",
        code: `onboarding {
    new users see a guided tour
    @docs: "./docs/onboarding.md"
    @docs: "./wiki/export/onboarding.html"
}`,
      },
      {
        language: "md",
        label: "docs/onboarding.md",
        code: `# Onboarding

1. Install the extension
2. Open a \`.rq\` file
3. Run \`/rq-search\` to explore the graph`,
      },
    ],
  },
  {
    id: "data-not-ideas",
    title: "Data, not ideas",
    summary:
      "Don't store records, config values, or inventories in .rq — point at the source of truth.",
    tags: ["antipattern", "data", "pointers"],
    blocks: [
      {
        language: "rq",
        label: "antipattern",
        code: `support_contacts {
    alice: alice@example.com
    bob: bob@example.com
    carol: carol@example.com
}`,
      },
      {
        language: "rq",
        label: "prefer",
        code: `support_contacts {
    canonical list lives in ["./data/contacts.json"]
    validated by ["./src/contacts.test.ts"]
}`,
      },
      {
        language: "py",
        label: "apythonfile.py",
        code: `class APythonClass:
    def say_hello(self) -> None:
        print("hello")`,
      },
    ],
  },
  {
    id: "graph-traversal",
    title: "Graph traversal",
    summary: "Explore the requirement graph visually — filter, scope, export.",
    tags: ["extension", "graph"],
    blocks: [
      {
        kind: "features",
        items: [
          "Filter by file, tag, or status",
          "Local graph scoped to file or selection",
          "Export graph to JSON or CSV",
        ],
      },
      {
        language: "rq",
        code: `auth.login ──► session.rq:12
              └──► [auth.logout]
                   └──► ["./auth.ts".login]`,
      },
      {
        language: "md",
        code: `Reqlan: Get Local Graph
Reqlan: Export JSON`,
      },
    ],
  },
] satisfies Showcase[];

export type Showcases = typeof showcases;

export function getShowcase(slug: string): Showcase | undefined {
  return showcases.find((showcase) => showcase.id === slug);
}
