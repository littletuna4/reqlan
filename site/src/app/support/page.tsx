import type { Metadata } from "next";

import { support } from "@/content/support";
import { pageMetadata } from "@/lib/site-metadata";
import { SupportPage } from "@/views/SupportPage";

export const metadata: Metadata = pageMetadata({
  title: support.title,
  description: support.lead,
  path: "/support/",
});

export default function Page() {
  // rq:["../../../../reqlan rq/site/support-page.rq".support_page]

  return <SupportPage />;
}
