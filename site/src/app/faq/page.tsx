import type { Metadata } from "next";

import { faq } from "@/content/faq";
import { pageMetadata } from "@/lib/site-metadata";
import { FaqPage } from "@/views/FaqPage";

export const metadata: Metadata = pageMetadata({
  title: faq.title,
  description: faq.lead,
  path: "/faq/",
});

export default function Page() {
  return <FaqPage />;
}
