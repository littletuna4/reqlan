// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".links]
import {
  phonebookLinks,
  phonebookPackages,
} from "@/lib/phonebook";
import type { LinkItem, PackageItem } from "@/content/types";

export const contact = {
  title: "Go deeper",
  packagesTitle: "Packages",
  links: phonebookLinks satisfies LinkItem[],
  packages: phonebookPackages satisfies PackageItem[],
} as const;
