import { CodeBlock } from "@/components/CodeBlock";
import { MotivationClient } from "@/components/MotivationClient";
import { siteContent } from "@/content/site";

export async function Motivation() {
  const { motivation } = siteContent;

  return (
    <MotivationClient tabs={motivation.tabs}>
      {await Promise.all(
        motivation.tabs.map(async (tab) => (
          <div key={tab.id}>
            {tab.features ? (
              <ul className="feature-list">
                {tab.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : null}
            {tab.code ? (
              <CodeBlock
                language={tab.language ?? "rq"}
                content={tab.code}
              />
            ) : null}
          </div>
        )),
      )}
    </MotivationClient>
  );
}
