"use client";

import { RqCode } from "@/components/RqCode";
import { useState } from "react";
import { siteContent } from "@/content/site";

export function Motivation() {
  const { motivation } = siteContent;
  const [activeId, setActiveId] = useState(motivation.tabs[0].id);

  const activeTab =
    motivation.tabs.find((tab) => tab.id === activeId) ?? motivation.tabs[0];

  return (
    <section
      id="motivation"
      className="content-section"
      aria-labelledby="motivation-title"
    >
      <h2 id="motivation-title" className="section-title">
        Motivation
      </h2>

      <div className="tab-panel">
        <div
          role="tablist"
          aria-label="Motivation"
          className="tab-list"
        >
          {motivation.tabs.map((tab) => {
            const isActive = tab.id === activeId;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                className={isActive ? "tab is-active" : "tab"}
                onClick={() => setActiveId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${activeTab.id}`}
          aria-labelledby={`tab-${activeTab.id}`}
          className="tab-content"
        >
          <RqCode code={activeTab.code} />
        </div>
      </div>
    </section>
  );
}
