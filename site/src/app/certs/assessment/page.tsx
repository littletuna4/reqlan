import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { assessments } from "@/content/assessment";
import { CERTS_ASSESSMENT_PATH } from "@/lib/certs-paths";
import { pageMetadata } from "@/lib/site-metadata";
import { AssessmentListPage } from "@/views/AssessmentListPage";
import { AssessmentPage } from "@/views/AssessmentPage";

export const metadata: Metadata = pageMetadata({
  title: pages.assessment.title,
  description: pages.assessment.description,
  path: `${CERTS_ASSESSMENT_PATH}/`,
});

export default function Page() {
  // rq:["../../../../../reqlan rq/site/certs.rq".assessment_page]
  if (assessments.length === 1) {
    return <AssessmentPage assessment={assessments[0]!} />;
  }
  return <AssessmentListPage />;
}
