/**
 * Write self-contained harness HTML next to built webviews for docs captures.
 * Each harness mocks acquireVsCodeApi and seeds demo host messages.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  demoAncestors,
  demoContextModel,
  demoGraphSlice,
  demoIdea,
  demoIdeaSearchResults,
  demoIdeasPage,
  demoIndexStatus,
  demoOnboardingInit,
  demoTodoList,
} from "../fixtures/demo-data.ts";
import { CAPTURE_BASE_CSS } from "../lib/capture-css.ts";
import { webviewMediaRoot } from "../lib/paths.ts";
import { VSCODE_THEME_CSS } from "../lib/vscode-theme.ts";
import { DOCS_IMAGE_SHOTS } from "../shots/catalog.ts";
import type { DocsShot } from "../shots/types.ts";
import { DEFAULT_GRAPH_UI_STATE } from "../../../../packages/extension/src/webview_module/shared/graph-ui-state.ts";

function json(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function shellStyles(shot: DocsShot): string {
  const { width, height } = shot.viewport;
  return `${VSCODE_THEME_CSS}
${CAPTURE_BASE_CSS}
${shot.captureCss ?? ""}
html, body { width: ${width}px !important; height: ${height}px !important; }
`;
}

function activityBarHarness(options: {
  searchOnReady: boolean;
  initialState: unknown;
  styles: string;
  width: number;
  height: number;
}): string {
  const bootstrap = [
    {
      type: "editorContext",
      syncWithEditor: true,
      globalHopDepth: 1,
      minHopDepth: 1,
      maxHopDepth: 4,
      dimensionHopDepth: {},
    },
    { type: "indexHealth", status: demoIndexStatus() },
    {
      type: "phonebookLinks",
      links: [
        {
          id: "site",
          label: "reqlan site",
          href: "https://littletuna4.github.io/reqlan/",
        },
      ],
    },
    { type: "tray", tray: { pinned: [] } },
    { type: "context", model: demoContextModel() },
    { type: "bootstrapComplete" },
  ];
  if (options.searchOnReady) {
    bootstrap.push({
      type: "ideaSearchResults",
      payload: demoIdeaSearchResults(),
    } as never);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${options.width}, height=${options.height}, initial-scale=1.0" />
  <title>docs harness</title>
  <link rel="stylesheet" href="./main.css" />
  <style>${options.styles}</style>
</head>
<body>
  <div id="app"><p class="shell-loading">Loading…</p></div>
  <script>
    (() => {
      const initialState = ${json(options.initialState)};
      const bootstrap = ${json(bootstrap)};
      let state = initialState;
      const reply = (message) => window.postMessage(message, "*");
      window.acquireVsCodeApi = () => ({
        postMessage(msg) {
          if (!msg || typeof msg !== "object") return;
          if (msg.type === "ready") {
            for (const m of bootstrap) reply(m);
            return;
          }
          if (msg.type === "loadGraph") {
            reply({ type: "graphSlice", slice: ${json(demoGraphSlice())}, requestId: msg.requestId });
            return;
          }
          if (msg.type === "loadAncestors") {
            reply({ type: "ancestors", result: ${json(demoAncestors())}, requestId: msg.requestId });
            return;
          }
          if (msg.type === "loadReferences") {
            reply({
              type: "references",
              payload: {
                ideaId: ${json(demoIdea.id)},
                rows: ${json(demoContextModel().references?.rows ?? [])},
                grouped: {},
              },
              requestId: msg.requestId,
            });
            return;
          }
          if (msg.type === "searchIdeas") {
            reply({
              type: "ideaSearchResults",
              payload: { ...${json(demoIdeaSearchResults())}, query: msg.query || "password empty" },
              requestId: msg.requestId,
            });
            return;
          }
          if (msg.type === "loadTodos") {
            reply({ type: "todoList", payload: ${json(demoTodoList())}, requestId: msg.requestId });
            return;
          }
          if (msg.type === "loadIndexHealth") {
            reply({ type: "indexHealth", status: ${json(demoIndexStatus())} });
          }
        },
        getState() { return state; },
        setState(next) { state = next; },
      });
    })();
  </script>
  <script type="module" src="./main.js"></script>
</body>
</html>`;
}

function ideasSummaryHarness(options: {
  styles: string;
  width: number;
  height: number;
}): string {
  const ideas = demoIdeasPage();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${options.width}, height=${options.height}, initial-scale=1.0" />
  <title>docs harness</title>
  <link rel="stylesheet" href="./main.css" />
  <style>${options.styles}</style>
</head>
<body>
  <div id="app"></div>
  <script>
    (() => {
      let state = { activeTab: "graph" };
      const reply = (message) => window.postMessage(message, "*");
      window.acquireVsCodeApi = () => ({
        postMessage(msg) {
          if (!msg || typeof msg !== "object") return;
          if (msg.type === "ready") {
            reply({ type: "indexStatus", status: ${json(demoIndexStatus())} });
            reply({ type: "graphUiState", state: ${json(DEFAULT_GRAPH_UI_STATE)} });
            reply({
              type: "overviewLinks",
              links: [{ id: "site", label: "Site", href: "https://littletuna4.github.io/reqlan/" }],
            });
            reply({ type: "graphSlice", slice: ${json(demoGraphSlice())} });
            return;
          }
          if (msg.type === "loadGraph" || msg.type === "loadIndexStatus") {
            if (msg.type === "loadIndexStatus") {
              reply({ type: "indexStatus", status: ${json(demoIndexStatus())} });
            } else {
              reply({ type: "graphSlice", slice: ${json(demoGraphSlice())}, requestId: msg.requestId });
            }
            return;
          }
          if (msg.type === "loadIdeas") {
            reply({
              type: "ideasPage",
              query: ${json(ideas.query)},
              total: ${json(ideas.total)},
              rows: ${json(ideas.rows)},
            });
          }
        },
        getState() { return state; },
        setState(next) { state = next; },
      });
    })();
  </script>
  <script type="module" src="./main.js"></script>
</body>
</html>`;
}

function onboardingHarness(options: {
  styles: string;
  width: number;
  height: number;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${options.width}, height=${options.height}, initial-scale=1.0" />
  <title>docs harness</title>
  <link rel="stylesheet" href="./main.css" />
  <style>${options.styles}</style>
</head>
<body>
  <div id="app"></div>
  <script>
    (() => {
      const init = ${json(demoOnboardingInit())};
      window.acquireVsCodeApi = () => ({
        postMessage(msg) {
          if (msg && msg.type === "ready") {
            window.postMessage(init, "*");
          }
        },
        getState() { return undefined; },
        setState() {},
      });
    })();
  </script>
  <script type="module" src="./main.js"></script>
</body>
</html>`;
}

export async function writeDocsHarnesses(
  shots: readonly DocsShot[] = DOCS_IMAGE_SHOTS,
): Promise<void> {
  for (const shot of shots) {
    const styles = shellStyles(shot);
    const { width, height } = shot.viewport;
    let html: string;
    if (shot.webview === "activity-bar") {
      html = activityBarHarness({
        searchOnReady: shot.id === "chat-search",
        initialState: shot.initialState ?? null,
        styles,
        width,
        height,
      });
    } else if (shot.webview === "ideas-summary") {
      html = ideasSummaryHarness({ styles, width, height });
    } else {
      html = onboardingHarness({ styles, width, height });
    }
    const out = join(webviewMediaRoot, shot.webview, `docs-${shot.id}.html`);
    await writeFile(out, html);
    console.log(`wrote harness ${out} (${width}×${height})`);
  }
}
