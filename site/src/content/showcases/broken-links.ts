// rq:["../../../../reqlan rq/site/site.rq".broken_links_showcase]
// rq:["../../../../reqlan rq/core_analysis/check.rq".check]
// rq:["../../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
// rq:["../../../../reqlan rq/extension/syntax/features-syntax.rq".file_references]
import type { Showcase } from "./types";

export const brokenLinksShowcase = {
  id: "broken-links",
  title: "Links that break loudly",
  summary:
    "Rename a file. Editor diagnostic, rewritten refs, then `reqlan check` in CI. Not a wiki.",
  tags: ["diagnostics", "refactor", "cli", "ci"],
  mechanism: "diagnostics + check + CI",
  domain: "Refactor safety",
  tier: "flagship",
  blocks: [
    {
      kind: "callout",
      text: "The editor flags it. `reqlan check` fails the merge.",
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
      kind: "exchange",
      label: "reqlan check",
      query: "reqlan check",
      response: `## Issues (1)

./src/handlers/auth.ts
- auth.rq:3 login [file_reference]

exit 1`,
    },
    {
      language: "yaml",
      label: "ci",
      code: `# .github/workflows/ci.yml
- name: Check requirement references
  run: npx @reqlan/cli check`,
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
    {
      kind: "exchange",
      label: "after - reqlan check",
      query: "reqlan check",
      response: `No issues.

exit 0`,
    },
  ],
} satisfies Showcase;
