// rq:["../../../../reqlan rq/site/site.rq".attribute_dialect_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".attribute_forms]
import type { Showcase } from "./types";

export const attributeDialectShowcase = {
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
} satisfies Showcase;
