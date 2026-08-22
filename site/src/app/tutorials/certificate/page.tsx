import type { Metadata } from "next";

import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { CERTS_CERTIFICATE_PATH } from "@/lib/certs-paths";

export const metadata: Metadata = {
  title: "Certificate · reqlan",
  description: "reqlan tutorial certificate",
};

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".certificate_page]
  return <LegacyPathRedirect to={`${CERTS_CERTIFICATE_PATH}/`} />;
}
