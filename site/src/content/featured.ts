// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".featured_in_section]
import type { FeaturedItem } from "@/content/types";

export const featured = {
  title: "As featured in:",
  items: [
    {
      id: "agentlanguages",
      label: "agentlanguages.dev",
      href: "https://agentlanguages.dev/languages/reqlan/",
      icon: { set: "mdi", name: "web" },
    },
    {
      id: "awesome-sdd",
      label: "awesome-spec-driven-development",
      href: "https://github.com/Engineering4AI/awesome-spec-driven-development",
      icon: { set: "simple-icons", name: "github" },
    },
    {
      id: "awesome-docs",
      label: "awesome-docs",
      href: "https://github.com/testthedocs/awesome-docs",
      icon: { set: "simple-icons", name: "github" },
    },
  ] satisfies FeaturedItem[],
} as const;
