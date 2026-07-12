"use client";

import { Icon } from "@iconify/react/dist/offline";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  installActions,
  type InstallAction,
  type QuickstartIdeId,
} from "@/content/install-actions";
import { getPreferredIde } from "@/lib/deeplink";
import { resolveQuickstartIcon } from "@/lib/quickstart-icons";
import { cn } from "@/lib/utils";
import {
  InstallFallback,
  useInstallActionHandler,
} from "@/components/InstallFallback";
import styles from "./InstallSplitButton.module.css";

const buttonGlyph = { set: "mdi", name: "package-down" } as const;

function ActionIcon({ action }: { action: InstallAction }) {
  const data = resolveQuickstartIcon(action.icon);
  if (!data) {
    return null;
  }

  return <Icon icon={data} className={styles.actionIcon} aria-hidden />;
}

export function InstallSplitButton() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [lastUsedId, setLastUsedId] = useState<QuickstartIdeId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { fallback, runInstallAction, dismissFallback } =
    useInstallActionHandler();

  useEffect(() => {
    const stored = getPreferredIde();
    if (stored) {
      setLastUsedId(stored);
    }
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    dismissFallback();
  }, [dismissFallback]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const handleSelect = useCallback(
    async (action: InstallAction) => {
      setLastUsedId(action.id);
      await runInstallAction(action);
      // Deep links reveal an inline recovery panel on failure, so keep the
      // menu open; external links and downloads are terminal, so dismiss it.
      if (action.kind !== "deeplink") {
        setMenuOpen(false);
      }
    },
    [runInstallAction],
  );

  const glyph = resolveQuickstartIcon(buttonGlyph);

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
      >
        {glyph ? (
          <Icon icon={glyph} className={styles.buttonIcon} aria-hidden />
        ) : null}
        <span>Install</span>
        <span
          className={cn(styles.chevron, menuOpen && styles.chevronOpen)}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          className={cn(styles.menu, fallback && styles.menuBare)}
          role="menu"
        >
          {fallback ? (
            <InstallFallback ideId={fallback.ideId} onDismiss={dismissFallback} />
          ) : (
            <>
              <p className={styles.menuLabel}>Install for your editor</p>
              {installActions.map((action) => {
                const isLastUsed = action.id === lastUsedId;

                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => handleSelect(action)}
                  >
                    <ActionIcon action={action} />
                    <span className={styles.menuItemLabel}>{action.label}</span>
                    {isLastUsed ? (
                      <span className={styles.menuMark}>Last used</span>
                    ) : null}
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
