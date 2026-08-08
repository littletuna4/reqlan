import type { Page } from "playwright";

import { demoOnboardingInit } from "../fixtures/demo-data.ts";
import { ONBOARDING_CAPTURE_CSS } from "../lib/capture-css.ts";
import { postToWebview } from "../lib/host.ts";
import type { DocsShot } from "./types.ts";

async function handleOnboardingHost(
  page: Page,
  message: unknown,
): Promise<void> {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return;
  }
  const msg = message as { type: string };
  if (msg.type === "ready") {
    await postToWebview(page, demoOnboardingInit());
  }
}

export const fileLinkShot: DocsShot = {
  id: "file-link",
  webview: "onboarding",
  // Compact code frame — hide hero/links via capture CSS, show file-ref lines.
  viewport: { width: 560, height: 360, deviceScaleFactor: 2 },
  settleMs: 400,
  readySelector: ".rq-code",
  captureSelector: ".rq-code",
  captureCss: ONBOARDING_CAPTURE_CSS,
  onHostMessage: (page, message) => handleOnboardingHost(page, message),
  afterReady: async (page) => {
    const code = page.locator(".rq-code").first();
    await code.waitFor({ timeout: 10_000 });
    // Prefer the references block that shows file paths.
    await page.evaluate(() => {
      const root = document.querySelector(".rq-code");
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node.textContent?.includes("./otherfiles.rq")) {
          (node.parentElement ?? root).scrollIntoView({
            block: "center",
            inline: "nearest",
          });
          return;
        }
        node = walker.nextNode();
      }
      root.scrollIntoView({ block: "start" });
    });
  },
};
