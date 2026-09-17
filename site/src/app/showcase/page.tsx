import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { pageMetadata } from "@/lib/site-metadata";
import { ShowcaseListPage } from "@/views/ShowcaseListPage";

export const metadata: Metadata = pageMetadata({
  title: pages.showcase.title,
  description: pages.showcase.description,
  path: "/showcase/",
});

export default function Page() {
  return <ShowcaseListPage />;
}
