// rq:["../../../../reqlan rq/site/site.rq".antipatterns_showcase]
// rq:["../../../../reqlan rq/site/site.rq".showcase_thesis]
import type { Showcase } from "./types";

export const antipatternsShowcase = {
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
} satisfies Showcase;
