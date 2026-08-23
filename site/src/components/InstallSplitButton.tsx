"use client";

import { Icon } from "@iconify/react/dist/offline";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  cliInstallCommands,
  getCliInstallCommand,
  heroInstallActions,
  type CliInstallCommand,
  type InstallAction,
  type QuickstartIconRef,
  type QuickstartIdeId,
} from "@/content/install-actions";
import { getPreferredIde } from "@/lib/deeplink";
import { usePreferredPackageManager } from "@/lib/use-package-manager";
import { resolveQuickstartIcon } from "@/lib/quickstart-icons";
import { cn } from "@/lib/utils";
import {
  InstallFallback,
  useInstallActionHandler,
} from "@/components/InstallFallback";
import styles from "./InstallSplitButton.module.css";

const extensionGlyph = { set: "mdi", name: "package-down" } as const;
const cliGlyph = { set: "mdi", name: "console" } as const;

function ActionIcon({ icon }: { icon: QuickstartIconRef }) {
  const data = resolveQuickstartIcon(icon);
  if (!data) {
    return null;
  }

  return <Icon icon={data} className={styles.actionIcon} aria-hidden />;
}

function useDismissibleMenu() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

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

  return { rootRef, menuOpen, setMenuOpen, closeMenu };
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function InstallSplitButton() {
  // rq:["../../../reqlan rq/site/site.rq".cta_icon]
  const menuId = useId();
  const { rootRef, menuOpen, setMenuOpen, closeMenu } = useDismissibleMenu();
  const [lastUsedId, setLastUsedId] = useState<QuickstartIdeId | null>(null);
  const { fallback, runInstallAction, dismissFallback } =
    useInstallActionHandler();

  useEffect(() => {
    const stored = getPreferredIde();
    if (stored && stored !== "openvsx") {
      setLastUsedId(stored);
    }
  }, []);

  const dismiss = useCallback(() => {
    closeMenu();
    dismissFallback();
  }, [closeMenu, dismissFallback]);

  useEffect(() => {
    if (!menuOpen) {
      dismissFallback();
    }
  }, [menuOpen, dismissFallback]);

  const handleSelect = useCallback(
    async (action: InstallAction) => {
      setLastUsedId(action.id);
      await runInstallAction(action);
      // Deep links reveal an inline recovery panel on failure, so keep the
      // menu open; external links and downloads are terminal, so dismiss it.
      if (action.kind !== "deeplink") {
        dismiss();
      }
    },
    [dismiss, runInstallAction],
  );

  const glyph = resolveQuickstartIcon(extensionGlyph);

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => (menuOpen ? dismiss() : setMenuOpen(true))}
      >
        {glyph ? (
          <Icon icon={glyph} className={styles.buttonIcon} aria-hidden />
        ) : null}
        <span>Install extension</span>
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
            heroInstallActions.map((action) => {
              const isLastUsed = action.id === lastUsedId;

              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => handleSelect(action)}
                >
                  <ActionIcon icon={action.icon} />
                  <span className={styles.menuItemLabel}>{action.label}</span>
                  {isLastUsed ? (
                    <span className={styles.menuMark}>Last used</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CliInstallButton() {
  // rq:["../../../reqlan rq/site/site.rq".install_cli_menu]
  // rq:["../../../reqlan rq/site/site.rq".package_manager_preference]
  const menuId = useId();
  const { rootRef, menuOpen, setMenuOpen, closeMenu } = useDismissibleMenu();
  const [copiedId, setCopiedId] = useState<CliInstallCommand["id"] | null>(
    null,
  );
  const [packageManager, setPackageManager] = usePreferredPackageManager();
  const selectedCommand = getCliInstallCommand(packageManager);

  const handleCopy = useCallback(
    async (command: CliInstallCommand) => {
      setPackageManager(command.id);
      const copied = await copyText(command.command);
      setCopiedId(copied ? command.id : null);
      if (!copied) {
        return;
      }

      window.setTimeout(() => {
        setCopiedId((current) => (current === command.id ? null : current));
      }, 1800);
    },
    [setPackageManager],
  );

  const glyph = resolveQuickstartIcon(cliGlyph);
  const copiedSelected = copiedId === selectedCommand.id && !menuOpen;

  return (
    <div className={styles.wrap} ref={rootRef}>
      <div className={styles.split}>
        <button
          type="button"
          className={styles.splitMain}
          title={`Copy ${selectedCommand.command}`}
          onClick={() => {
            closeMenu();
            void handleCopy(selectedCommand);
          }}
        >
          {glyph ? (
            <Icon icon={glyph} className={styles.buttonIcon} aria-hidden />
          ) : null}
          <span>{copiedSelected ? "Copied" : "Install CLI"}</span>
        </button>
        <button
          type="button"
          className={styles.splitChevron}
          aria-label="More package managers"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span
            className={cn(styles.chevron, menuOpen && styles.chevronOpen)}
            aria-hidden
          >
            ▾
          </span>
        </button>
      </div>

      {menuOpen ? (
        <div id={menuId} className={styles.menu} role="menu">
          {cliInstallCommands.map((command) => {
            const copied = command.id === copiedId;
            const isSelected = command.id === packageManager;

            return (
              <button
                key={command.id}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                aria-label={`Copy ${command.label} install command`}
                onClick={() => handleCopy(command)}
              >
                <ActionIcon icon={command.icon} />
                <span className={styles.menuItemStack}>
                  <span className={styles.menuItemLabel}>{command.label}</span>
                  <code className={styles.menuItemCommand}>
                    {command.command}
                  </code>
                </span>
                {copied ? (
                  <span className={styles.menuMark}>Copied</span>
                ) : isSelected ? (
                  <span className={styles.menuMark}>Selected</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
