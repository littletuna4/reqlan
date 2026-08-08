import type { Page } from "playwright";

import {
  demoGraphSlice,
  demoIdeasPage,
  demoIndexStatus,
} from "../fixtures/demo-data.ts";
import { IDEAS_SUMMARY_CAPTURE_CSS } from "../lib/capture-css.ts";
import { postToWebview } from "../lib/host.ts";
import type { DocsShot } from "./types.ts";

async function handleIdeasSummaryHost(
  page: Page,
  message: unknown,
): Promise<void> {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return;
  }
  const msg = message as { type: string; requestId?: number };

  switch (msg.type) {
    case "ready":
      await postToWebview(page, {
        type: "indexStatus",
        status: demoIndexStatus(),
      });
      await postToWebview(page, {
        type: "overviewLinks",
        links: [
          {
            id: "site",
            label: "Site",
            href: "https://littletuna4.github.io/reqlan/",
          },
        ],
      });
      await postToWebview(page, {
        type: "graphSlice",
        slice: demoGraphSlice(),
        requestId: msg.requestId,
      });
      break;
    case "loadIndexStatus":
      await postToWebview(page, {
        type: "indexStatus",
        status: demoIndexStatus(),
      });
      break;
    case "loadGraph":
      await postToWebview(page, {
        type: "graphSlice",
        slice: demoGraphSlice(),
        requestId: msg.requestId,
      });
      break;
    case "loadIdeas": {
      const pageData = demoIdeasPage();
      await postToWebview(page, {
        type: "ideasPage",
        query: pageData.query,
        total: pageData.total,
        rows: pageData.rows,
      });
      break;
    }
    case "loadOverviewCoverage":
      await postToWebview(page, {
        type: "overviewCoverage",
        scores: {
          ideaCount: 24,
          rqFileCount: 4,
          eligibleNonRqFileCount: 8,
          referencedEligibleFileCount: 5,
          fileCoveragePct: 62.5,
          distinctFileReferenceCount: 5,
          totalLoc: 1200,
          ideasPerKLoc: 20,
          locTruncated: false,
          calculatedAt: Date.now(),
        },
      });
      break;
    default:
      break;
  }
}

export const montageIdeShot: DocsShot = {
  id: "montage-ide",
  webview: "ideas-summary",
  // Panel aspect for slides — room for chrome + graph without clipping nodes.
  viewport: { width: 720, height: 560, deviceScaleFactor: 2 },
  settleMs: 900,
  readySelector: "h1",
  captureSelector: "#app",
  captureCss: IDEAS_SUMMARY_CAPTURE_CSS,
  initialState: { activeTab: "graph" },
  onHostMessage: (page, message) => handleIdeasSummaryHost(page, message),
  afterReady: async (page) => {
    await page.waitForSelector("canvas", { timeout: 10_000 });
    const fit = page.getByRole("button", { name: /fit to view/i });
    if (await fit.count()) {
      await fit.click();
    }
    await page.waitForTimeout(500);
  },
};
