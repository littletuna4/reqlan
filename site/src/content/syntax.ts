// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".syntax_section]
// rq:["../../../reqlan rq/site/site.rq".code_block_styling]
import type { SyntaxExample } from "@/content/types";

export const syntax = {
  title: "How are ideas actually written",
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
    rotates on use - aligns with [session_expiry]
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
    You can import [importable_python_module] - arbitrary files, not only .rq.
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
      label: "wildcards",
      rule: {
        language: "rq",
        code: `wildcard_refs {
    One edge that fans out - path glob plus idea pattern.
    ["../panels/*.rq".*_pane] matches every *_pane idea under panels/.
}`,
      },
      practical: {
        label: "surface.rq",
        language: "rq",
        code: `extension_surface {
    Panes live across files - open the set, not each name by hand.
    See ["../extension/**/*.rq".*_pane]
    @status done
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
} as const;
