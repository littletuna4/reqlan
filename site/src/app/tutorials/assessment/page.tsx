import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { CERTS_ASSESSMENT_PATH } from "@/lib/certs-paths";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: pages.assessment.title,
  description: pages.assessment.description,
  path: `${CERTS_ASSESSMENT_PATH}/`,
});

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".assessment_page]
  return <LegacyPathRedirect to={`${CERTS_ASSESSMENT_PATH}/`} />;
}
