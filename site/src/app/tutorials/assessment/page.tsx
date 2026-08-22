import type { Metadata } from "next";

import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { CERTS_ASSESSMENT_PATH } from "@/lib/certs-paths";

export const metadata: Metadata = {
  title: "Assessment · reqlan",
  description:
    "Short quiz on reqlan get-started and concepts. Pass to claim a certificate.",
};

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".assessment_page]
  return <LegacyPathRedirect to={`${CERTS_ASSESSMENT_PATH}/`} />;
}
