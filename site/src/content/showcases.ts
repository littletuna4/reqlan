import type { CodeLanguage } from "@/content/types";

export type ShowcaseTier = "flagship" | "depth";

export type ShowcaseCodeBlock = {
  language: CodeLanguage;
  code: string;
  label?: string;
  caption?: string;
};

export type ShowcaseFeaturesBlock = {
  kind: "features";
  label?: string;
  caption?: string;
  items: string[];
};

export type ShowcaseCalloutBlock = {
  kind: "callout";
  text: string;
};

export type ShowcaseExchangeBlock = {
  kind: "exchange";
  label?: string;
  query: string;
  response: string;
};

export type ShowcaseDiagnosticBlock = {
  kind: "diagnostic";
  label?: string;
  severity?: "error" | "warning";
  message: string;
  fixes?: string[];
};

export type ShowcaseDiagramBlock = {
  kind: "diagram";
  label?: string;
  caption?: string;
  content: string;
};

export type ShowcaseBlock =
  | ShowcaseCodeBlock
  | ShowcaseFeaturesBlock
  | ShowcaseCalloutBlock
  | ShowcaseExchangeBlock
  | ShowcaseDiagnosticBlock
  | ShowcaseDiagramBlock;

export type Showcase = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  /** Short badge: the mechanism this page demonstrates. */
  mechanism: string;
  domain: string;
  tier: ShowcaseTier;
  blocks: ShowcaseBlock[];
};

export const showcases = [
  {
    id: "agent-context",
    title: "Context for the agent, not the repo",
    summary:
      "Six ideas and their edges beat forty files. Hand the agent a shaped slice.",
    tags: ["ai", "mcp", "planning"],
    mechanism: "MCP + token discipline",
    domain: "AI tooling",
    tier: "flagship",
    blocks: [
      {
        kind: "callout",
        text: "Ask about session expiry. Dump the repo, or query the graph.",
      },
      {
        language: "rq",
        label: "auth/session.rq",
        code: `session_expiry {
    expired tokens must reject requests
    refresh must not resurrect a revoked session
    implemented in ["./src/auth/session.ts".validateSession]
    proven by ["./src/auth/session.test.ts:rejects expired access token"]
    @status done
    @tags (
        auth
        security
    )
}

session_refresh {
    refresh tokens rotate on use
    aligns with [session_expiry]
    @status pending
}

logout {
    clears access and refresh cookies
    aligns with [session_expiry]
    @status done
}

auth_surface (
    session_expiry,
    session_refresh,
    logout
)`,
      },
      {
        kind: "exchange",
        label: "naive",
        query: "grep -R session src/ | head -200",
        response: `src/auth/session.ts
src/auth/cookies.ts
src/auth/oauth.ts
src/middleware.ts
src/routes/me.ts
… 34 more files

token cost: ~18k  ·  signal: low`,
      },
      {
        kind: "exchange",
        label: "mcp file_context",
        query: `file_context({ filePath: "src/auth/session.ts" })`,
        response: `→ session_expiry   status=done
→ session_refresh  status=pending
→ logout           status=done
  edges: file_reference, references, comment_link
  slice: 3 ideas · ~400 tokens`,
      },
      {
        language: "rq",
        label: "plan the agent writes",
        code: `session_refresh_plan {
    finish [session_refresh] against [session_expiry]
    @plan {
        steps (
            - rotate refresh token in ["./src/auth/session.ts".rotateRefresh]
            - reject reuse of the old refresh token
            - prove with ["./src/auth/session.test.ts:rejects reused refresh token"]
        )
    }
    @status in-progress
}`,
      },
    ],
  },
  {
    id: "interlock",
    title: "The interlock that must not fail",
    summary:
      "A safety requirement bound to ST by line range, to a test by name, and back by an rq: comment.",
    tags: ["industrial", "safety", "sequencing"],
    mechanism: "symbol · line · test anchors",
    domain: "Industrial control",
    tier: "flagship",
    blocks: [
      {
        kind: "callout",
        text: "One name - EmergencyStop - from requirement to PLC to proof.",
      },
      {
        language: "rq",
        label: "safety/interlock.rq",
        code: `EmergencyStop {
    E-stop must drop heater enable within one scan
    valve must close before heater enables
    pressure must reach setpoint before valve opens
    implemented in ["./plc/interlock.st".EmergencyStop]
    proven by ["./plc/interlock.test.ts:drops heater within one scan"]
    @status verified
    @tags (
        iec-61131
        critical
        safety
    )
}

safety_interlock {
    guards [EmergencyStop] on every phase transition
    @status verified
}`,
      },
      {
        language: "st",
        label: "plc/interlock.st",
        code: `(* rq:["../safety/interlock.rq".EmergencyStop] *)
FUNCTION_BLOCK EmergencyStop
VAR_INPUT
    Estop_NC : BOOL;
END_VAR
VAR_OUTPUT
    HeaterEnable : BOOL;
    ValveOpen    : BOOL;
END_VAR

HeaterEnable := Estop_NC AND NOT ValveOpen;
ValveOpen    := Estop_NC AND PressureOk;
END_FUNCTION_BLOCK`,
      },
      {
        language: "ts",
        label: "plc/interlock.test.ts",
        code: `test("drops heater within one scan", () => {
  const fb = new EmergencyStop();
  fb.Estop_NC = false;
  fb.cycle();
  expect(fb.HeaterEnable).toBe(false);
});`,
      },
      {
        kind: "diagram",
        label: "trace",
        content: `EmergencyStop
  ├── ["./plc/interlock.st".EmergencyStop]
  ├── ["./plc/interlock.test.ts:drops heater within one scan"]
  └── rq: comment in ST → back to the idea`,
      },
    ],
  },
  {
    id: "broken-links",
    title: "Links that break loudly",
    summary:
      "Rename a file. See the diagnostic, the quick-fix, the rewritten refs. Not a wiki.",
    tags: ["diagnostics", "refactor"],
    mechanism: "diagnostics + file mutation",
    domain: "Refactor safety",
    tier: "flagship",
    blocks: [
      {
        kind: "callout",
        text: "Requirements that rot silently are worse than no requirements.",
      },
      {
        language: "rq",
        label: "before - auth.rq",
        code: `login {
    oauth handshake for the web client
    implemented in ["./src/handlers/auth.ts".login]
    @status done
}

session {
    cookie session after [login]
    implemented in ["./src/middleware/session.ts"]
}`,
      },
      {
        language: "md",
        label: "rename",
        code: `git mv src/handlers/auth.ts src/handlers/oauth.ts`,
      },
      {
        kind: "diagnostic",
        label: "auth.rq",
        severity: "error",
        message:
          'File reference "./src/handlers/auth.ts" could not be resolved',
        fixes: [
          "Update path to ./src/handlers/oauth.ts",
          "Search workspace for auth.ts",
          "Create missing file",
        ],
      },
      {
        language: "rq",
        label: "after - refs rewritten",
        code: `login {
    oauth handshake for the web client
    implemented in ["./src/handlers/oauth.ts".login]
    @status done
}

session {
    cookie session after [login]
    implemented in ["./src/middleware/session.ts"]
}`,
      },
    ],
  },
  {
    id: "firmware-cloud",
    title: "Firmware meets the cloud",
    summary:
      "10 Hz on the device, 50 ms on the ingest path - one invariant neither codebase can hold alone.",
    tags: ["integration", "cross-stack", "embedded"],
    mechanism: "cross-stack file refs",
    domain: "Embedded ↔ backend",
    tier: "flagship",
    blocks: [
      {
        kind: "callout",
        text: "The contract lives in .rq because C and TypeScript cannot see each other.",
      },
      {
        language: "rq",
        label: "contracts/ingest.rq",
        code: `sensor_sample_rate {
    device samples at 10 Hz
    implemented in ["./firmware/adc.c".sample_loop]
    @tags (
        firmware
        timing
    )
}

api_ingest {
    backend must accept a burst within 50 ms
    implemented in ["./api/ingest.ts".ingestBatch]
    aligns with [sensor_sample_rate]
    @tags (
        backend
        sla
    )
}

ingest_contract (
    sensor_sample_rate,
    api_ingest
)`,
      },
      {
        language: "c",
        label: "firmware/adc.c",
        code: `/* rq:["../contracts/ingest.rq".sensor_sample_rate] */
void sample_loop(void) {
    const uint32_t period_ms = 100; /* 10 Hz */
    for (;;) {
        adc_read(&sample);
        queue_push(&sample);
        sleep_ms(period_ms);
    }
}`,
      },
      {
        language: "ts",
        label: "api/ingest.ts",
        code: `// rq:["../contracts/ingest.rq".api_ingest]
export async function ingestBatch(events: Event[]) {
  const deadline = Date.now() + 50;
  await queue.push(events, { deadline });
}`,
      },
      {
        kind: "features",
        label: "in the editor",
        items: [
          "Inbound @referenced-by inlay on sample_loop and ingestBatch",
          "Go-to-definition from either side into the shared .rq idea",
          "Local graph centered on ingest_contract shows both stacks",
        ],
      },
    ],
  },
  {
    id: "audit-trail",
    title: "An audit trail you can export",
    summary:
      "Custom clause attributes, a coverage gap from Completion Status, HTML export for the auditor.",
    tags: ["compliance", "audit", "export"],
    mechanism: "attributes · completion · HTML export",
    domain: "Regulated software",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "Standards are ideas with evidence - and a report you can hand over.",
      },
      {
        language: "rq",
        label: "compliance/access.rq",
        code: `"SOC2 CC6.1 access control" {
    login must use oauth
    session timeout aligns with [session_policy]
    @clause CC6.1
    @evidence ["./docs/access-control.md"]
    @verified_by ["./auth/access.test.ts:enforces session timeout"]
    @status verified
    @tags (
        soc2
        cc6.1
    )
}

session_policy {
    idle timeout is 15 minutes
    implemented in ["./src/auth/session.ts".idleTimeoutMs]
    @status done
}

"SOC2 CC6.2 privilege" {
    role changes require dual control
    @clause CC6.2
    @status pending
    @tags (
        soc2
        cc6.2
    )
}`,
      },
      {
        kind: "exchange",
        label: "Reqlan: Completion Status",
        query: "Reqlan: Completion Status",
        response: `blocking: 1
  "SOC2 CC6.2 privilege"  @status pending

verified: 1
  "SOC2 CC6.1 access control"

coverage: 50% of soc2-tagged ideas`,
      },
      {
        kind: "features",
        label: "export",
        items: [
          "Reqlan: Export HTML → multi-page static site",
          "Ideas, files, clusters, searchable graph",
          "Hand the folder to the auditor - no wiki drift",
        ],
      },
    ],
  },
  {
    id: "module-surface",
    title: "A module's published surface",
    summary:
      "billing exports an ideaset. checkout imports only that. Reaching past the boundary is an error.",
    tags: ["modularity", "imports", "ideasets"],
    mechanism: "ideasets as public API",
    domain: "Monorepo architecture",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "An ideaset is the module's published surface - not its internals.",
      },
      {
        language: "rq",
        label: "billing/interface.rq",
        code: `charge {
    capture payment for a checkout total
    implemented in ["./src/billing/charge.ts".charge]
    @status done
}

refund_policy {
    refunds within 30 days require original charge id
    @status done
}

// internals - not in the published surface
ledger_posting {
    double-entry write after capture
    @status done
}

billing_api (
    charge,
    refund_policy
)`,
      },
      {
        language: "rq",
        label: "checkout/checkout.rq",
        code: `import "../billing/interface.rq" as billing

checkout {
    must call [billing.charge] after session is valid
    refunds follow [billing.refund_policy]
    @status done
}`,
      },
      {
        kind: "diagnostic",
        label: "reaching past the boundary",
        severity: "error",
        message:
          "Could not resolve reference to IdeaDeclaration named 'ledger_posting'.",
        fixes: [
          "Import from a file that exports ledger_posting",
          "Add ledger_posting to billing_api",
          "Create the missing idea",
        ],
      },
    ],
  },
  {
    id: "test-proves",
    title: "What this test actually proves",
    summary:
      "Test-name anchors bind intent to the case. The test file points back.",
    tags: ["testing", "traceability"],
    mechanism: "test-name anchors",
    domain: "Testing",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "The assertion string is not the requirement. Link them.",
      },
      {
        language: "rq",
        label: "auth/expiry.rq",
        code: `session_expiry {
    expired tokens must reject requests
    refresh is not attempted for an expired access token
    proven by ["./auth.test.ts:rejects expired access token"]
    @status verified
}`,
      },
      {
        language: "ts",
        label: "auth.test.ts",
        code: `// rq:["./expiry.rq".session_expiry]
test("rejects expired access token", async () => {
  const res = await request(app)
    .get("/me")
    .set("Authorization", \`Bearer \${expired}\`);
  expect(res.status).toBe(401);
});`,
      },
      {
        kind: "features",
        label: "what the link proves",
        items: [
          "Expired JWT returns 401",
          "Refresh flow is not attempted for expired access tokens",
          "Go-to-definition from the idea lands on the test(...) line",
        ],
      },
    ],
  },
  {
    id: "legacy-archaeology",
    title: "Archaeology on inherited code",
    summary:
      "Seed an rq: comment into an undocumented function, mark the old path @deprecated, see impact.",
    tags: ["legacy", "discovery", "deprecation"],
    mechanism: "comment links · deprecation impact",
    domain: "Legacy migration",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "Find the intent, pin it, then retire the path that still calls it.",
      },
      {
        language: "py",
        label: "legacy/billing.py - before",
        code: `def calc_total(lines, tax_region):
    """nobody knows why tax_region is a string."""
    ...`,
      },
      {
        language: "rq",
        label: "migrate/billing.rq",
        code: `calc_total {
    order total includes regional tax
    tax_region is an ISO-3166-2 code
    implemented in ["./legacy/billing.py".calc_total]
    @status in-progress
    @tags (
        legacy
        billing
    )
}

legacy_tax_helper {
    superseded by [calc_total]
    @deprecated
    @status pending
}`,
      },
      {
        language: "py",
        label: "legacy/billing.py - after",
        code: `# rq:["../migrate/billing.rq".calc_total]
def calc_total(lines, tax_region):
    """order total includes regional tax (ISO-3166-2)."""
    ...`,
      },
      {
        kind: "exchange",
        label: "Reqlan: Deprecation Impact",
        query: "Reqlan: Deprecation Impact  →  legacy_tax_helper",
        response: `deprecated: legacy_tax_helper
inbound:
  checkout.rq → [legacy_tax_helper]
  reports/tax.py  rq:[legacy_tax_helper]
impact: 2 references still live`,
      },
    ],
  },
  {
    id: "graph-view",
    title: "See the whole graph",
    summary:
      "Cytoscape in Ideas Summary - filter by status or tag, toggle indirect depth.",
    tags: ["extension", "graph"],
    mechanism: "Cytoscape · filters · depth",
    domain: "Extension UI",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "The graph is a view of the index - not ASCII arrows in a .rq file.",
      },
      {
        language: "rq",
        label: "slice under the cursor",
        code: `auth_login {
    starts the oauth handshake
    aligns with [auth_session]
    implemented in ["./auth.ts".login]
    @status done
    @tags (
        auth
    )
}

auth_session {
    cookie after [auth_login]
    aligns with [auth_logout]
    @status done
}

auth_logout {
    clears cookies from [auth_session]
    @status done
}`,
      },
      {
        kind: "diagram",
        label: "Ideas Summary · Graph",
        content: `auth_login ──► auth_session ──► auth_logout
     │                │
     └──► auth.ts     └──► (indirect: depth 2)`,
      },
      {
        kind: "features",
        label: "shipped controls",
        items: [
          "Filter by file, tag, or status",
          "Indirect-reference depth toggle (1 vs 2 hop)",
          "Reqlan: Get Local Graph - scoped HTML panel",
          "Reqlan: Open Ideas Summary - full Cytoscape view",
        ],
      },
    ],
  },
  {
    id: "attribute-dialect",
    title: "Attributes as a domain dialect",
    summary:
      "Flags, negated flags, block values, nested lists - arbitrary @keys without changing the grammar.",
    tags: ["attributes", "extensibility"],
    mechanism: "full attribute grammar",
    domain: "Hardware / manufacturing",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: "The language stays small. Your domain vocabulary rides on @attributes.",
      },
      {
        language: "rq",
        label: "hardware/valve.rq",
        code: `valve_control {
    fail-closed on loss of air
    @owner process-team
    @priority P1
    @sil 2
    @required
    @dfm!
    @plan {
        steps (
            - lockout tagout procedure signed
            - stroke test recorded
        )
    }
    @tags (
        safety
        plc
        pneumatic
    )
    @bom (
        actuator {
            part AV-440
        }
        solenoid {
            part SV-12 24V
        }
    )
    @status verified
}`,
      },
      {
        kind: "features",
        label: "forms in play",
        items: [
          "@required - bare flag",
          "@dfm! - negated flag (design-for-manufacture waived)",
          "@plan { ... } - block value",
          "@bom ( name { ... } ) - named nested lists",
          "@sil 2 - scalar domain metadata",
        ],
      },
    ],
  },
  {
    id: "antipatterns",
    title: "Three ways to write .rq badly",
    summary:
      "Data instead of pointers, prose restating code, one monolithic file. Negative space is taste.",
    tags: ["antipattern", "craft"],
    mechanism: "pointers, not data",
    domain: "Craft",
    tier: "depth",
    blocks: [
      {
        kind: "callout",
        text: ".rq holds intent and links. Sources of truth stay where they belong.",
      },
      {
        language: "rq",
        label: "1 - data in the idea (don't)",
        code: `support_contacts {
    alice: alice@example.com
    bob: bob@example.com
    carol: carol@example.com
}`,
      },
      {
        language: "rq",
        label: "1 - prefer",
        code: `support_contacts {
    canonical list lives in ["./data/contacts.json"]
    validated by ["./src/contacts.test.ts"]
}`,
      },
      {
        language: "rq",
        label: "2 - restating the code (don't)",
        code: `apply_theme {
    sets documentElement.dataset.theme to mode
    then calls localStorage.setItem with key theme
}`,
      },
      {
        language: "rq",
        label: "2 - prefer",
        code: `apply_theme {
    theme preference persists across reloads
    implemented in ["./src/theme.ts".applyTheme]
    @status done
}`,
      },
      {
        language: "rq",
        label: "3 - one monolithic file (don't)",
        code: `// everything.rq - 2_000 lines, every team, every domain
// nobody owns it; search returns noise; reviews stall`,
      },
      {
        language: "rq",
        label: "3 - prefer",
        code: `import "../billing/interface.rq" as billing
import "../auth/interface.rq" as auth

checkout {
    orchestrates [billing.charge] after [auth.session]
}`,
      },
    ],
  },
] satisfies Showcase[];

export type Showcases = typeof showcases;

export function getShowcase(slug: string): Showcase | undefined {
  return showcases.find((showcase) => showcase.id === slug);
}

export function isCodeBlock(block: ShowcaseBlock): block is ShowcaseCodeBlock {
  return "language" in block && "code" in block;
}
