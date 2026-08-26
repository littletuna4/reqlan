// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps_page]
// rq:["../../../reqlan rq/site/site.rq".tutorials_section]
import type { Metadata } from "next";

import { firstStepsContent } from "@/content/first-steps";
import { FirstStepsPage } from "@/views/FirstStepsPage";

export const metadata: Metadata = {
  title: `${firstStepsContent.title} · reqlan`,
  description: firstStepsContent.intro,
};

export default function Page() {
  return <FirstStepsPage />;
}
