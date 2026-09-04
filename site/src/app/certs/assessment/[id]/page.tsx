import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { assessments, getAssessment } from "@/content/assessment";
import { AssessmentPage } from "@/views/AssessmentPage";

type PageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return assessments.map((assessment) => ({ id: assessment.id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const assessment = getAssessment(id);

  if (!assessment) {
    return {};
  }

  return {
    title: "Assessment · reqlan",
    description:
      "Pass the reqlan assessment to claim a certificate of completion.",
  };
}

export default async function Page({ params }: PageProps) {
  // rq:["../../../../../../reqlan rq/site/certs.rq".assessment]
  // rq:["../../../../../../reqlan rq/site/certs.rq".assessment_page]
  const { id } = await params;
  const assessment = getAssessment(id);

  if (!assessment) {
    notFound();
  }

  return <AssessmentPage assessment={assessment} />;
}
