"use client";

import { Children, useState } from "react";
import type { MotivationTab } from "@/content/site";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./MotivationClient.module.css";

type MotivationClientProps = {
  tabs: MotivationTab[];
  children: React.ReactNode;
};

export function MotivationClient({ tabs, children }: MotivationClientProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <section
      id="motivation"
      className={shared.contentSection}
      aria-labelledby="motivation-title"
    >
      <h2 id="motivation-title" className={shared.sectionTitle}>
        Motivation
      </h2>

      <div className={styles.panel}>
        <div role="tablist" aria-label="Motivation" className={styles.tabList}>
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
                {child}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
