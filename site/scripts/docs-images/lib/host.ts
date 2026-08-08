import type { Page } from "playwright";

import { VSCODE_THEME_CSS } from "./vscode-theme.ts";

export type HostHandler = (message: unknown) => void | Promise<void>;

/**
 * Install acquireVsCodeApi before page scripts run.
 * `onHostMessage` receives webview→host posts; reply with window.postMessage.
 */
export async function installVsCodeHost(
  page: Page,
  options: {
    initialState?: unknown;
    onHostMessage: HostHandler;
  },
): Promise<void> {
  await page.exposeFunction("__reqlanDocsHostMessage", options.onHostMessage);

  await page.addInitScript(
    ({ state, themeCss }) => {
      const style = document.createElement("style");
      style.id = "reqlan-docs-theme";
      style.textContent = themeCss;
      document.documentElement.appendChild(style);

      let persisted = state ?? undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).acquireVsCodeApi = () => ({
        postMessage(message: unknown) {
          // Fire-and-forget into Node via Playwright binding.
          void (window as unknown as {
            __reqlanDocsHostMessage: (m: unknown) => Promise<void>;
          }).__reqlanDocsHostMessage(message);
        },
        getState() {
          return persisted;
        },
        setState(next: unknown) {
          persisted = next;
        },
      });
    },
    { state: options.initialState ?? null, themeCss: VSCODE_THEME_CSS },
  );
}

export async function postToWebview(
  page: Page,
  message: unknown,
): Promise<void> {
  await page.evaluate((payload) => {
    window.postMessage(payload, "*");
  }, message);
}
