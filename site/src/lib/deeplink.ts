import type { QuickstartIdeId } from "@/content/install-actions";

const STORAGE_KEY = "reqlan.preferredIde";
const DEEPLINK_TIMEOUT_MS = 1200;

export type DeepLinkResult = "opened" | "failed";

export function getPreferredIde(): QuickstartIdeId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(STORAGE_KEY);
  if (
    value === "cursor" ||
    value === "vscode" ||
    value === "openvsx" ||
    value === "vsix"
  ) {
    return value;
  }

  return null;
}

export function setPreferredIde(id: QuickstartIdeId): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, id);
}

export function attemptDeepLink(deeplink: string): Promise<DeepLinkResult> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve("failed");
      return;
    }

    let settled = false;

    const finish = (result: DeepLinkResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const onBlur = () => finish("opened");
    const onVisibilityChange = () => {
      if (document.hidden) {
        finish("opened");
      }
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    const timer = window.setTimeout(() => finish("failed"), DEEPLINK_TIMEOUT_MS);

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    window.location.assign(deeplink);
  });
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
