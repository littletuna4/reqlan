"use client";

import { Icon } from "@iconify/react/dist/offline";
import { useCallback, useEffect, useState } from "react";

import {
  InstallFallback,
  useInstallActionHandler,
} from "@/components/InstallFallback";
import { PhonebookIcon } from "@/components/PhonebookIcon";
import {
  quickstartContent,
  type QuickstartIde,
  type QuickstartIdeId,
  type QuickstartPackage,
} from "@/content/quickstart";
import { getPreferredIde } from "@/lib/deeplink";
import { getPhonebookPackage } from "@/lib/phonebook";
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

function PackageSection({ pkg }: { pkg: QuickstartPackage }) {
  const npm = getPhonebookPackage(pkg.packageId);

  return (
    <section
      id={pkg.id}
      className={styles.package}
      aria-labelledby={`quickstart-${pkg.id}-title`}
    >
      <div className={styles.packageHead}>
        <h2 id={`quickstart-${pkg.id}-title`} className={styles.nextTitle}>
          {pkg.title}
        </h2>
        <a
          href={npm.href}
          className={styles.npmLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PhonebookIcon icon={npm.icon} />
          {npm.label}
        </a>
      </div>
      <p className={styles.tagline}>{pkg.intro}</p>
      <div className={styles.cli}>
        <span className={styles.cliLabel}>Install</span>
        <code className={styles.cliCode}>{pkg.install}</code>
        <CopyButton value={pkg.install} />
      </div>
      <ol className={styles.steps}>
        {pkg.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {pkg.commands?.length ? (
        <ul className={styles.commandList}>
          {pkg.commands.map((command) => (
            <li key={command}>
              <div className={styles.cli}>
                <span className={styles.cliLabel}>Run</span>
                <code className={styles.cliCode}>{command}</code>
                <CopyButton value={command} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {pkg.snippet ? (
        <div className={styles.snippet}>
          <div className={styles.snippetBar}>
            <span className={styles.cliLabel}>{pkg.snippet.label}</span>
            <CopyButton value={pkg.snippet.value} />
          </div>
          <pre className={styles.snippetPre}>
            <code>{pkg.snippet.value}</code>
          </pre>
        </div>
      ) : null}
      {pkg.tips?.length ? (
        <ul className={styles.tips}>
          {pkg.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function QuickstartClient({ initialIde }: QuickstartClientProps) {
  const { ides, defaultIde, nextSteps, related, packages } = quickstartContent;
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

      <section
        id="extension"
        className={styles.package}
        aria-labelledby="quickstart-extension-title"
      >
        <h2 id="quickstart-extension-title" className={styles.nextTitle}>
          Extension
        </h2>
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
      </section>

      {packages.map((pkg) => (
        <PackageSection key={pkg.id} pkg={pkg} />
      ))}

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

      <section className={styles.related} aria-labelledby="quickstart-related-title">
        <h2 id="quickstart-related-title" className={styles.nextTitle}>
          Keep going
        </h2>
        <ul className={styles.relatedList}>
          {related.map((item) => (
            <li key={item.id}>
              <a href={sitePath(`${item.href}/`)} className={styles.relatedLink}>
                <span className={styles.relatedLabel}>{item.label}</span>
                <span className={styles.relatedDetail}>{item.detail}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
