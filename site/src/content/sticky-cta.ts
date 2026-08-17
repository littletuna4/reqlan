// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".sticky_cta_node]
import { cta } from "@/content/hero";
import type { PhonebookLinkId } from "@/lib/phonebook";

export const stickyCta = {
  label: "Site actions",
  drag: {
    label: "Move",
  },
  star: {
    label: "Star us on GitHub",
    linkId: "github" satisfies PhonebookLinkId,
  },
  tryExtension: {
    label: "Try the extension",
    href: cta.href,
    iconLinkId: "vsc" satisfies PhonebookLinkId,
  },
} as const;
