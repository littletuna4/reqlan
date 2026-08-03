import type { Metadata } from "next";

import { AssessmentPage } from "@/views/AssessmentPage";

export const metadata: Metadata = {
  title: "Tutorial assessment · reqlan",
  description:
    "Short quiz on reqlan get-started and concepts. Pass to claim a certificate link.",
};

export default function Page() {
  return <AssessmentPage />;
}
