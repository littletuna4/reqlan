import { CodeBlock } from "@/components/CodeBlock";
import { MotivationClient } from "@/components/MotivationClient";
import { siteContent } from "@/content/site";
import shared from "./shared.module.css";

export function Motivation() {
  const { motivation } = siteContent;

  return (
    <MotivationClient tabs={motivation.tabs}>
      {motivation.tabs.map((tab) => (
        <div key={tab.id}>
          {tab.features ? (
            <ul className={shared.featureList}>
              {tab.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          ) : null}
          {tab.code ? (
            <CodeBlock
              language={tab.language ?? "rq"}
              content={tab.code}
              highlightKey={
                tab.language && tab.language !== "rq"
                  ? (`motivation:${tab.id}` as const)
                  : undefined
              }
            />
          ) : null}
        </div>
      ))}
    </MotivationClient>
  );
}
