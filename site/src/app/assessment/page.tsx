import type { Metadata } from "next";

import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { CERTS_ASSESSMENT_PATH } from "@/lib/certs-paths";

export const metadata: Metadata = {
  title: "Assessment · reqlan",
  description:
    "Pass the reqlan assessment to claim a certificate of completion.",
};

export default function Page() {
  // rq:["../../../../reqlan rq/site/certs.rq".assessment_page]
  return <LegacyPathRedirect to={`${CERTS_ASSESSMENT_PATH}/`} />;
}
