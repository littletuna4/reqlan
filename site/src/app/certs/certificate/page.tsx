import type { Metadata } from "next";

import { CertificatePage } from "@/views/CertificatePage";

export const metadata: Metadata = {
  title: "Certificate · reqlan",
  description: "reqlan tutorial certificate",
};

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".certificate_page]
  return <CertificatePage />;
}
