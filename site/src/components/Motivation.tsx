import { MotivationClient } from "@/components/MotivationClient";
import { motivation } from "@/content/motivation";

export function Motivation() {
  // rq:["../../../reqlan rq/site/site.rq".motivation_section]

  return (
    <MotivationClient
      title={motivation.title}
      lead={motivation.lead}
      slides={motivation.slides}
    />
  );
}
