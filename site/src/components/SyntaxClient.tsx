"use client";

import { Children, useState } from "react";
import type { SyntaxExample } from "@/content/types";
import shared from "./shared.module.css";
import styles from "./Syntax.module.css";

type SyntaxClientProps = {
  examples: readonly SyntaxExample[];
  children: React.ReactNode;
};

export function SyntaxClient({ examples, children }: SyntaxClientProps) {
  const [showingExample, setShowingExample] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const childList = Children.toArray(children);

  return (
    <div className={styles.examples}>
      {examples.map((example, index) => {
        const showExample = showingExample.has(example.label);
        const rule = childList[index * 2];
        const practical = childList[index * 2 + 1];

        return (
          <article key={example.label} className={styles.example}>
            <span className={shared.syntaxLabel}>{example.label}</span>
            <div className={styles.frame}>
              <button
                type="button"
                className={styles.toggle}
                aria-pressed={showExample}
                onClick={() =>
                  setShowingExample((current) => {
                    const next = new Set(current);
                    if (next.has(example.label)) {
                      next.delete(example.label);
                    } else {
                      next.add(example.label);
                    }
                    return next;
                  })
                }
              >
                {showExample ? "show explainer" : "show example"}
              </button>
              <div
                className={styles.slot}
                data-view={showExample ? "example" : "rule"}
              >
                {showExample ? practical : rule}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
