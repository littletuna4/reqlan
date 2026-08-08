import type { Page } from "playwright";

import {
  demoAncestors,
  demoContextModel,
  demoGraphSlice,
  demoIdea,
  demoIdeaSearchResults,
  demoIndexStatus,
  demoTodoList,
} from "../fixtures/demo-data.ts";
import { ACTIVITY_BAR_CAPTURE_CSS, CHAT_SEARCH_CAPTURE_CSS } from "../lib/capture-css.ts";
import { postToWebview } from "../lib/host.ts";
import type { DocsShot } from "./types.ts";

async function bootstrapActivityBar(page: Page): Promise<void> {
  const index = demoIndexStatus();
  const context = demoContextModel();
  await postToWebview(page, {
    type: "editorContext",
    syncWithEditor: true,
    globalHopDepth: 1,
    minHopDepth: 1,
    maxHopDepth: 4,
    dimensionHopDepth: {},
    pinnedFocusId: undefined,
  });
  await postToWebview(page, { type: "indexHealth", status: index });
  await postToWebview(page, {
    type: "phonebookLinks",
    links: [
      {
        id: "site",
        label: "reqlan site",
        href: "https://littletuna4.github.io/reqlan/",
      },
    ],
  });
  await postToWebview(page, { type: "tray", tray: { pinned: [] } });
  await postToWebview(page, { type: "context", model: context });
  await postToWebview(page, { type: "bootstrapComplete" });
}

async function handleActivityBarHost(
  page: Page,
  message: unknown,
  options?: { searchOnReady?: boolean },
): Promise<void> {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return;
  }
  const msg = message as { type: string; requestId?: number; query?: string };

  switch (msg.type) {
    case "ready":
      await bootstrapActivityBar(page);
      if (options?.searchOnReady) {
        await postToWebview(page, {
          type: "ideaSearchResults",
          payload: demoIdeaSearchResults(),
        });
      }
      break;
    case "loadGraph":
      await postToWebview(page, {
        type: "graphSlice",
        slice: demoGraphSlice(),
        requestId: msg.requestId,
      });
      break;
    case "loadAncestors":
      await postToWebview(page, {
        type: "ancestors",
        result: demoAncestors(),
        requestId: msg.requestId,
      });
      break;
    case "loadReferences":
      await postToWebview(page, {
        type: "references",
        payload: {
          ideaId: demoIdea.id,
          rows: demoContextModel().references?.rows ?? [],
          grouped: {},
        },
        requestId: msg.requestId,
      });
      break;
    case "searchIdeas":
      await postToWebview(page, {
        type: "ideaSearchResults",
        payload: {
          ...demoIdeaSearchResults(),
          query: msg.query ?? "password empty",
        },
        requestId: msg.requestId,
      });
      break;
    case "loadTodos":
      await postToWebview(page, {
        type: "todoList",
        payload: demoTodoList(),
        requestId: msg.requestId,
      });
      break;
    case "loadIndexHealth":
      await postToWebview(page, {
        type: "indexHealth",
        status: demoIndexStatus(),
      });
      break;
    default:
      break;
  }
}

/** Narrow sidebar frame — matches VS Code activity-bar width on slides (~380px display). */
const SIDEBAR_VIEWPORT = { width: 320, height: 560, deviceScaleFactor: 2 } as const;

export const activityBarShot: DocsShot = {
  id: "activity-bar",
  webview: "activity-bar",
  viewport: SIDEBAR_VIEWPORT,
  settleMs: 600,
  readySelector: ".activity-bar",
  captureSelector: ".activity-bar",
  captureCss: ACTIVITY_BAR_CAPTURE_CSS,
  // Few panes so each has room — avoids nested scroll thumbs in the PNG.
  initialState: {
    panes: {
      workspace: true,
      search: false,
      todos: false,
      scope: true,
      selection: false,
      references: true,
      graph: false,
      parents: false,
      tray: false,
    },
    heights: {
      workspace: 120,
      scope: 220,
      references: 240,
    },
  },
  onHostMessage: (page, message) => handleActivityBarHost(page, message),
};

export const chatSearchShot: DocsShot = {
  id: "chat-search",
  webview: "activity-bar",
  viewport: { width: 320, height: 480, deviceScaleFactor: 2 },
  settleMs: 500,
  readySelector: ".search-results-list li, .activity-bar",
  captureSelector: ".activity-bar",
  captureCss: CHAT_SEARCH_CAPTURE_CSS,
  initialState: {
    panes: {
      workspace: false,
      search: true,
      todos: false,
      scope: false,
      selection: false,
      references: false,
      graph: false,
      parents: false,
      tray: false,
    },
  },
  onHostMessage: (page, message) =>
    handleActivityBarHost(page, message, { searchOnReady: true }),
  afterReady: async (page) => {
    const input = page.locator('input[type="search"]').first();
    await input.fill("password empty");
    await page.waitForSelector(".search-results-list li", { timeout: 10_000 });
  },
};
