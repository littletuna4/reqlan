import type { Metadata } from "next";

import { support } from "@/content/support";
import { SupportPage } from "@/views/SupportPage";

export const metadata: Metadata = {
  title: "Support · reqlan",
  description: support.lead,
};

export default function Page() {
  // rq:["../../../../reqlan rq/site/support-page.rq".support_page]

  return <SupportPage />;
}
