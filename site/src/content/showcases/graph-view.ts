// rq:["../../../../reqlan rq/site/site.rq".graph_view_showcase]
// rq:["../../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".graphical_graph]
import type { Showcase } from "./types";

export const graphViewShowcase = {
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
} satisfies Showcase;
