// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".roadmap_section]
import type { RoadmapItem } from "@/content/types";

export const roadmap = {
  title: "Roadmap",
  lead: "Where we're going.",
  items: [
    {
      id: "context",
      horizon: "Now",
      label: "Context that decides",
      detail:
        "Activity-bar signals for the next move - not just where a file came from.",
    },
    {
      id: "search",
      horizon: "Next",
      label: "Search in context",
      detail: "Rank matches from the ideas and files you already have open.",
    },
    {
      id: "rank",
      horizon: "Next",
      label: "Rank the neighbourhood",
      detail: "Pagerank and multi-seed distance so agents get the right slice.",
    },
    {
      id: "git",
      horizon: "Later",
      label: "Idea git history",
      detail: "CodeLens timeline on an idea - relative dates, moves included.",
    },
    {
      id: "walk",
      horizon: "Later",
      label: "How the graph is walked",
      detail: "Remember traversal patterns; recommend better next hops.",
    },
  ] satisfies RoadmapItem[],
} as const;
