"use client";

import { Children, useState } from "react";
import type { MotivationTab } from "@/content/site";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./MotivationClient.module.css";

type MotivationClientProps = {
  title: string;
  lead?: string;
  tabs: MotivationTab[];
  children: React.ReactNode;
};

export function MotivationClient({
  title,
  lead,
  tabs,
  children,
}: MotivationClientProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <section
      id="motivation"
      className={shared.contentSection}
      aria-labelledby="motivation-title"
    >
      <h2 id="motivation-title" className={shared.sectionTitle}>
        {title}
      </h2>
      {lead ? <p className={shared.sectionLead}>{lead}</p> : null}

      <div className={styles.panel}>
        <div role="tablist" aria-label={title} className={styles.tabList}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                className={cn(styles.tab, isActive && styles.tabActive)}
                onClick={() => setActiveId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${activeTab?.id ?? "none"}`}
          aria-labelledby={`tab-${activeTab?.id ?? "none"}`}
          className={styles.tabContent}
        >
          {Children.map(children, (child, index) => {
            const tab = tabs[index];
            if (!tab) {
              return null;
            }

            return (
              <div key={tab.id} hidden={tab.id !== activeId}>
                {tab.pitch ? (
                  <p className={shared.sectionPitch}>{tab.pitch}</p>
                ) : null}
                {child}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
