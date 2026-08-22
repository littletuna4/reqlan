// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".links]
// rq:["../../../reqlan rq/phonebook.rq".show_in_footer]
import {
  phonebookFooterLinks,
  phonebookPackages,
} from "@/lib/phonebook";
import type { LinkItem, PackageItem } from "@/content/types";

export const contact = {
  title: "Go deeper",
  packagesTitle: "Packages",
  links: phonebookFooterLinks satisfies LinkItem[],
  packages: phonebookPackages satisfies PackageItem[],
} as const;
