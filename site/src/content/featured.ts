// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".featured_in_section]
import type { FeaturedItem } from "@/content/types";

export const featured = {
  title: "Featured in",
  items: [
    {
      id: "agentlanguages",
      label: "agentlanguages.dev",
      href: "https://agentlanguages.dev/languages/reqlan/",
    },
    {
      id: "awesome-sdd",
      label: "awesome-spec-driven-development",
      href: "https://github.com/Engineering4AI/awesome-spec-driven-development",
    },
    {
      id: "awesome-docs",
      label: "awesome-docs",
      href: "https://github.com/testthedocs/awesome-docs",
    },
  ] satisfies FeaturedItem[],
} as const;
