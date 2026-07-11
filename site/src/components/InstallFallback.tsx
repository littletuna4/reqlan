"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import {
  getInstallAction,
  getMarketplaceHref,
  installActions,
  vsixDownloadUrl,
  type InstallAction,
  type QuickstartIdeId,
} from "@/content/install-actions";
import { attemptDeepLink, setPreferredIde } from "@/lib/deeplink";
import styles from "./InstallFallback.module.css";

type InstallFallbackProps = {
  ideId: QuickstartIdeId;
  onDismiss: () => void;
};

export function InstallFallback({ ideId, onDismiss }: InstallFallbackProps) {
  const action = getInstallAction(ideId);
  const marketplaceHref = getMarketplaceHref();
  const guideHref = `/quickstart?ide=${ideId}`;

  const copyCli = useCallback(async () => {
    if (!action.cli) {
      return;
    }

    try {
      await navigator.clipboard.writeText(action.cli);
    } catch {
      // ignore clipboard failures
    }
  }, [action.cli]);

  return (
    <div className={styles.fallback} role="status">
      <span className={styles.label}>Didn&apos;t open?</span>
      <div className={styles.actions}>
        <a
          className={styles.chip}
          href={marketplaceHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDismiss}
        >
          Marketplace
        </a>
        {action.cli ? (
          <button type="button" className={styles.chip} onClick={copyCli}>
            Copy CLI
          </button>
        ) : null}
        <a
          className={styles.chip}
          href={vsixDownloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDismiss}
        >
          VSIX
        </a>
        <Link className={styles.chip} href={guideHref} onClick={onDismiss}>
          Full guide
        </Link>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

export type InstallFallbackState = {
  ideId: QuickstartIdeId;
} | null;

export function useInstallActionHandler() {
  const [status, setStatus] = useState<string | null>(null);
  const [fallback, setFallback] = useState<InstallFallbackState>(null);

  const runInstallAction = useCallback(async (action: InstallAction) => {
    setPreferredIde(action.id);

    if (action.kind === "deeplink") {
      setStatus(`Opening ${action.label}…`);
      setFallback(null);

      const result = await attemptDeepLink(action.href);
      if (result === "opened") {
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }

      setStatus(null);
      setFallback({ ideId: action.id });
      return;
    }

    if (action.kind === "download" || action.kind === "external") {
      window.open(action.href, "_blank", "noopener,noreferrer");
      setFallback(null);
      setStatus(null);
    }
  }, []);

  const dismissFallback = useCallback(() => {
    setFallback(null);
  }, []);

  return {
    status,
    fallback,
    runInstallAction,
    dismissFallback,
  };
}

export { installActions };
