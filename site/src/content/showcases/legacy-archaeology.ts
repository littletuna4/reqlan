// rq:["../../../../reqlan rq/site/site.rq".legacy_archaeology_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".comment_reference]
// rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".deprecation_impact_analysis]
import type { Showcase } from "./types";

export const legacyArchaeologyShowcase = {
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
      // rq-ignore-error
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
} satisfies Showcase;
