import type { Metadata } from "next";

import { AssessmentPage } from "@/views/AssessmentPage";

export const metadata: Metadata = {
  title: "Assessment · reqlan",
  description:
    "Short quiz on reqlan get-started and concepts. Pass to claim a certificate.",
};

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".assessment_page]
  return <AssessmentPage />;
}
