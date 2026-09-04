import type { Metadata } from "next";

import { assessments } from "@/content/assessment";
import { AssessmentListPage } from "@/views/AssessmentListPage";
import { AssessmentPage } from "@/views/AssessmentPage";

export const metadata: Metadata = {
  title: "Assessment · reqlan",
  description:
    "Pass the reqlan assessment to claim a certificate of completion.",
};

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".assessment_page]
  if (assessments.length === 1) {
    return <AssessmentPage assessment={assessments[0]!} />;
  }
  return <AssessmentListPage />;
}
