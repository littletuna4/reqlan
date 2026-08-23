// rq:["../../../../reqlan rq/site/site.rq".agent_context_showcase]
// rq:["../../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
// rq:["../../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tree_interrogation]
// rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".local_graph_analysis]
import type { Showcase } from "./types";

export const agentContextShowcase = {
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
} satisfies Showcase;
