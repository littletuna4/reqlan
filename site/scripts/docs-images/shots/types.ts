import type { Page } from "playwright";

import type { DocsWebviewId } from "../lib/build-webviews.ts";

/** Browser viewport in CSS pixels — this is the capture frame. */
export type DocsViewport = {
  width: number;
  height: number;
  /** Device pixel ratio for sharper PNGs (slides display ~380px wide). */
  deviceScaleFactor?: number;
};

export type DocsShot = {
  /** Asset key written as presentations/assets/<id>.png */
  id: string;
  /** Built webview directory under media/webviews/ */
  webview: DocsWebviewId;
  /** Exact Playwright window / Emulation viewport. */
  viewport: DocsViewport;
  /** Optional webview getState() seed (pane expand / active tab). */
  initialState?: unknown;
  /** Wait after bootstrap before screenshot. */
  settleMs?: number;
  /** Optional selector to wait for before screenshot. */
  readySelector?: string;
  /** Host message handler: reply to webview posts. */
  onHostMessage: (page: Page, message: unknown) => void | Promise<void>;
  /** Optional post-load hook (scroll, click tab, etc.). */
  afterReady?: (page: Page) => void | Promise<void>;
  /**
   * Screenshot this element instead of the full viewport.
   * Prefer a compact root so slides are not mostly empty chrome.
   */
  captureSelector?: string;
  /** Extra CSS injected only for this capture (hide scrollbars, lock height). */
  captureCss?: string;
};
