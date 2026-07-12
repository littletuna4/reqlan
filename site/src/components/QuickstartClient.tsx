"use client";

import { Icon } from "@iconify/react/dist/offline";
import { useCallback, useEffect, useState } from "react";

import {
  InstallFallback,
  useInstallActionHandler,
} from "@/components/InstallFallback";
import {
  quickstartContent,
  type QuickstartIde,
  type QuickstartIdeId,
} from "@/content/quickstart";
import { getPreferredIde } from "@/lib/deeplink";
import { sitePath } from "@/lib/paths";
import { resolveQuickstartIcon } from "@/lib/quickstart-icons";
import { cn } from "@/lib/utils";
import shared from "./shared.module.css";
import styles from "./QuickstartClient.module.css";

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

  return <Icon icon={data} className={styles.ideIcon} aria-hidden />;
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
    <button type="button" className={styles.copy} onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function QuickstartClient({ initialIde }: QuickstartClientProps) {
  const { ides, defaultIde, nextSteps } = quickstartContent;
  const [activeId, setActiveId] = useState<QuickstartIdeId>(
    initialIde ?? defaultIde,
  );
  const { status, fallback, runInstallAction, dismissFallback } =
    useInstallActionHandler();

  useEffect(() => {
    const ideFromUrl = readIdeFromLocation();
    if (ideFromUrl) {
      setActiveId(ideFromUrl);
      return;
    }

    const stored = getPreferredIde();
    if (stored) {
      setActiveId(stored);
    }
  }, []);

  const activeIde =
    ides.find((ide) => ide.id === activeId) ??
    ides.find((ide) => ide.id === defaultIde) ??
    ides[0];

  const handlePrimary = useCallback(() => {
    void runInstallAction(activeIde);
  }, [activeIde, runInstallAction]);

  const handleDeepLink = useCallback(() => {
    if (!activeIde.deepLink) {
      return;
    }

    void runInstallAction({ ...activeIde, href: activeIde.deepLink, kind: "deeplink" });
  }, [activeIde, runInstallAction]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <a href={sitePath("/")} className={styles.back}>
          ← Home
        </a>
        <h1 className={styles.title}>{quickstartContent.title}</h1>
        <p className={styles.intro}>{quickstartContent.intro}</p>
      </header>

      <div className={styles.panel}>
        <div role="tablist" aria-label="Choose your editor" className={styles.ideList}>
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
                className={cn(styles.ideTab, isActive && styles.ideTabActive)}
                onClick={() => {
                  setActiveId(ide.id);
                  dismissFallback();
                  const url = new URL(window.location.href);
                  url.searchParams.set("ide", ide.id);
                  window.history.replaceState(null, "", url);
                }}
              >
                <IdeIcon icon={ide.icon} />
                <span className={styles.ideLabel}>{ide.label}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`quickstart-panel-${activeIde.id}`}
          aria-labelledby={`quickstart-tab-${activeIde.id}`}
          className={styles.detail}
        >
          <p className={styles.tagline}>{activeIde.tagline}</p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={handlePrimary}
            >
              {activeIde.primaryAction.label}
            </button>

            {activeIde.deepLink ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={handleDeepLink}
              >
                Try editor deep link
              </button>
            ) : null}
          </div>

          {status ? <p className={styles.installStatus}>{status}</p> : null}

          {fallback?.ideId === activeIde.id ? (
            <div className={styles.fallbackWrap}>
              <InstallFallback ideId={fallback.ideId} onDismiss={dismissFallback} />
            </div>
          ) : null}

          <ol className={styles.steps}>
            {activeIde.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {activeIde.cli ? (
            <div className={styles.cli}>
              <span className={styles.cliLabel}>Terminal</span>
              <code className={styles.cliCode}>{activeIde.cli}</code>
              <CopyButton value={activeIde.cli} />
            </div>
          ) : null}

          {activeIde.tips?.length ? (
            <ul className={styles.tips}>
              {activeIde.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <section className={styles.next} aria-labelledby="quickstart-next-title">
        <h2 id="quickstart-next-title" className={styles.nextTitle}>
          What&apos;s next
        </h2>
        <ul className={shared.featureList}>
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
