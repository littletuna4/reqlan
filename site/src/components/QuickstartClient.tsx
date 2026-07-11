"use client";

import { Icon } from "@iconify/react/dist/offline";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  quickstartContent,
  type QuickstartIde,
  type QuickstartIdeId,
} from "@/content/quickstart";
import { resolveQuickstartIcon } from "@/lib/quickstart-icons";

type QuickstartClientProps = {
  initialIde?: QuickstartIdeId;
};

const ideIds = new Set<QuickstartIdeId>(
  quickstartContent.ides.map((ide) => ide.id),
);

function readIdeFromLocation(): QuickstartIdeId | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const params = new URLSearchParams(window.location.search);
  const ide = params.get("ide");
  if (ide && ideIds.has(ide as QuickstartIdeId)) {
    return ide as QuickstartIdeId;
  }

  return undefined;
}

function IdeIcon({ icon }: { icon: QuickstartIde["icon"] }) {
  const data = resolveQuickstartIcon(icon);
  if (!data) {
    return null;
  }

  return <Icon icon={data} className="quickstart-ide-icon" aria-hidden />;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button type="button" className="quickstart-copy" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function QuickstartClient({ initialIde }: QuickstartClientProps) {
  const { ides, defaultIde, nextSteps } = quickstartContent;
  const [activeId, setActiveId] = useState<QuickstartIdeId>(
    initialIde ?? defaultIde,
  );

  useEffect(() => {
    const ideFromUrl = readIdeFromLocation();
    if (ideFromUrl) {
      setActiveId(ideFromUrl);
    }
  }, []);

  const activeIde =
    ides.find((ide) => ide.id === activeId) ??
    ides.find((ide) => ide.id === defaultIde) ??
    ides[0];

  return (
    <div className="quickstart">
      <header className="quickstart-header">
        <Link href="/" className="quickstart-back">
          ← Home
        </Link>
        <h1 className="quickstart-title">{quickstartContent.title}</h1>
        <p className="quickstart-intro">{quickstartContent.intro}</p>
      </header>

      <div className="quickstart-panel">
        <div role="tablist" aria-label="Choose your editor" className="quickstart-ide-list">
          {ides.map((ide) => {
            const isActive = ide.id === activeId;

            return (
              <button
                key={ide.id}
                type="button"
                role="tab"
                id={`quickstart-tab-${ide.id}`}
                aria-selected={isActive}
                aria-controls={`quickstart-panel-${ide.id}`}
                className={
                  isActive ? "quickstart-ide-tab is-active" : "quickstart-ide-tab"
                }
                onClick={() => {
                  setActiveId(ide.id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("ide", ide.id);
                  window.history.replaceState(null, "", url);
                }}
              >
                <IdeIcon icon={ide.icon} />
                <span className="quickstart-ide-label">{ide.label}</span>
                {ide.recommended ? (
                  <span className="quickstart-badge">Default</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`quickstart-panel-${activeIde.id}`}
          aria-labelledby={`quickstart-tab-${activeIde.id}`}
          className="quickstart-detail"
        >
          <p className="quickstart-tagline">{activeIde.tagline}</p>

          <div className="quickstart-actions">
            <a
              className="quickstart-primary"
              href={activeIde.primaryAction.href}
              {...(activeIde.primaryAction.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {activeIde.primaryAction.label}
            </a>

            {activeIde.deepLink ? (
              <a className="quickstart-secondary" href={activeIde.deepLink}>
                Try editor deep link
              </a>
            ) : null}
          </div>

          <ol className="quickstart-steps">
            {activeIde.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {activeIde.cli ? (
            <div className="quickstart-cli">
              <span className="quickstart-cli-label">Terminal</span>
              <code className="quickstart-cli-code">{activeIde.cli}</code>
              <CopyButton value={activeIde.cli} />
            </div>
          ) : null}

          {activeIde.tips?.length ? (
            <ul className="quickstart-tips">
              {activeIde.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <section className="quickstart-next" aria-labelledby="quickstart-next-title">
        <h2 id="quickstart-next-title" className="quickstart-next-title">
          What&apos;s next
        </h2>
        <ul className="feature-list">
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
