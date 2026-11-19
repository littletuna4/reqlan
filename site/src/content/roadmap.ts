// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".roadmap_section]
import type { RoadmapItem } from "@/content/types";
import {
  fileSpecHref,
  folderSpecHref,
  ideaSpecHref,
} from "@/lib/spec-path";

const CONTEXT_SCOPE_V2 = "reqlan rq/extension/local-context/context-scope-v2.rq";
const TYPE_SYSTEM = "reqlan rq/ingest/type-system.rq";
const SEARCH = "reqlan rq/core_analysis/search.rq";
const ADVANCED = "reqlan rq/modelling/advanced_analysis.rq";
const GIT_CODELENS = "reqlan rq/extension/index-host/git-codelens.rq";
const LOCAL_CONTEXT = "reqlan rq/extension/local-context";
const INGEST = "reqlan rq/ingest";
const MODELLING = "reqlan rq/modelling";

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
      spec: [
        {
          label: "context_scope_v2",
          href: ideaSpecHref(CONTEXT_SCOPE_V2, "context_scope_v2"),
        },
        {
          label: "local-context",
          href: folderSpecHref(LOCAL_CONTEXT),
        },
      ],
    },
    {
      id: "types",
      horizon: "Next",
      label: "Type system and verification",
      detail: "Declare types on ideas; verify them in reqlan check.",
      spec: [
        {
          label: "typed-reqlan",
          href: ideaSpecHref(TYPE_SYSTEM, "typed-reqlan"),
        },
        {
          label: "type-validation",
          href: ideaSpecHref(TYPE_SYSTEM, "type-validation"),
        },
        {
          label: "ingest",
          href: folderSpecHref(INGEST),
        },
      ],
    },
    {
      id: "rank",
      horizon: "Later",
      label: "Rank the neighbourhood",
      detail: "Pagerank and multi-seed distance so agents get the right slice.",
      spec: [
        {
          label: "pagerank",
          href: ideaSpecHref(ADVANCED, "pagerank"),
        },
        {
          label: "centroid_search",
          href: ideaSpecHref(ADVANCED, "centroid_search"),
        },
        {
          label: "modelling",
          href: folderSpecHref(MODELLING),
        },
      ],
    },
    {
      id: "git",
      horizon: "Later",
      label: "Idea git history",
      detail: "CodeLens timeline on an idea - relative dates, moves included.",
      spec: [
        {
          label: "git_based_history",
          href: ideaSpecHref(GIT_CODELENS, "git_based_history"),
        },
        {
          label: "git-codelens.rq",
          href: fileSpecHref(GIT_CODELENS),
        },
      ],
    },
    {
      id: "walk",
      horizon: "Later",
      label: "How the graph is walked",
      detail: "Remember traversal patterns; recommend better next hops.",
      spec: [
        {
          label: "markov_chain",
          href: ideaSpecHref(ADVANCED, "markov_chain"),
        },
        {
          label: "modelling",
          href: folderSpecHref(MODELLING),
        },
      ],
    },
    {
      id: "search",
      horizon: "Done",
      label: "Search in context",
      detail: "Rank matches from the ideas and files you already have open.",
      spec: [
        {
          label: "contextual_search",
          href: ideaSpecHref(SEARCH, "contextual_search"),
        },
        {
          label: "search_with_context",
          href: ideaSpecHref(ADVANCED, "search_with_context"),
        },
      ],
    },
  ] satisfies RoadmapItem[],
} as const;
