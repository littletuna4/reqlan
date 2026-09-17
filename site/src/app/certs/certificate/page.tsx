import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { CERTS_CERTIFICATE_PATH } from "@/lib/certs-paths";
import { pageMetadata } from "@/lib/site-metadata";
import { CertificatePage } from "@/views/CertificatePage";

export const metadata: Metadata = pageMetadata({
  title: pages.certificate.title,
  description: pages.certificate.description,
  path: `${CERTS_CERTIFICATE_PATH}/`,
});

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".certificate_page]
  return <CertificatePage />;
}
