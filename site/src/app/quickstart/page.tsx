import type { Metadata } from "next";

import { quickstartContent } from "@/content/quickstart";
import { pageMetadata } from "@/lib/site-metadata";
import { QuickstartPage } from "@/views/QuickstartPage";

export const metadata: Metadata = pageMetadata({
  title: quickstartContent.title,
  description: quickstartContent.intro,
  path: "/quickstart/",
});

export default function Page() {
  return <QuickstartPage />;
}
