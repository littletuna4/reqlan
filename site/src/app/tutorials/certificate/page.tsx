import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { CERTS_CERTIFICATE_PATH } from "@/lib/certs-paths";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: pages.certificate.title,
  description: pages.certificate.description,
  path: `${CERTS_CERTIFICATE_PATH}/`,
});

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".certificate_page]
  return <LegacyPathRedirect to={`${CERTS_CERTIFICATE_PATH}/`} />;
}
