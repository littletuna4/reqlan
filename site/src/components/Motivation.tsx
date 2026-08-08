import { MotivationClient } from "@/components/MotivationClient";
import { siteContent } from "@/content/site";

export function Motivation() {
  const { motivation } = siteContent;

  return (
    <MotivationClient
      title={motivation.title}
      lead={motivation.lead}
      slides={motivation.slides}
    />
  );
}
