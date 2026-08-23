// rq:["../../../../reqlan rq/site/site.rq".audit_trail_showcase]
// rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".completion_tracking]
// rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export]
import type { Showcase } from "./types";

export const auditTrailShowcase = {
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
} satisfies Showcase;
