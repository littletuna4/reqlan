// rq:["../../../../reqlan rq/site/site.rq".module_surface_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".ideaset]
// rq:["../../../../reqlan rq/language/imports.rq".import_namespace]
import type { Showcase } from "./types";

export const moduleSurfaceShowcase = {
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
} satisfies Showcase;
