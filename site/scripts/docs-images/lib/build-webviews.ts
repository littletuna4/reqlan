import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extensionRoot, webviewMediaRoot } from "./paths.ts";
import { run } from "./run.ts";

export const DOCS_WEBVIEW_IDS = [
  "activity-bar",
  "ideas-summary",
  "onboarding",
] as const;

export type DocsWebviewId = (typeof DOCS_WEBVIEW_IDS)[number];

/** Build only the Vite webviews needed for docs image capture. */
export function buildDocsWebviews(
  ids: readonly DocsWebviewId[] = DOCS_WEBVIEW_IDS,
): void {
  for (const id of ids) {
    const config = resolve(
      extensionRoot,
      "webviews",
      id,
      "vite.config.ts",
    );
    if (!existsSync(config)) {
      throw new Error(`Missing Vite config for webview "${id}": ${config}`);
    }
    console.log(`Building webview: ${id}`);
    run("npx", ["vite", "build", "--config", config], extensionRoot);
    const outDir = resolve(webviewMediaRoot, id);
    if (!existsSync(resolve(outDir, "index.html"))) {
      throw new Error(`Webview build missing index.html: ${outDir}`);
    }
  }
}
