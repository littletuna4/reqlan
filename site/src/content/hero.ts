// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".hero_section]
// rq:["../../../reqlan rq/site/site.rq".cta_icon]
// rq:["../../../reqlan rq/site/site.rq".hero_github_star]
import type { PhonebookLinkId } from "@/lib/phonebook";

export const hero = {
  snippet: `reqlan {
    semantic *engineering* toolset
}`,
} as const;

export const cta = {
  label: "Get started",
  href: "/quickstart",
} as const;

export const starCta = {
  label: "Star on GitHub",
  linkId: "github" satisfies PhonebookLinkId,
} as const;
