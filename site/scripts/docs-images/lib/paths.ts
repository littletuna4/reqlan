import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const siteRoot = resolve(here, "../../..");
export const workspaceRoot = resolve(siteRoot, "..");
export const extensionRoot = resolve(workspaceRoot, "packages/extension");
/** Vite `emptyOutDir` output — do not store docs harness HTML here. */
export const extensionMediaRoot = resolve(extensionRoot, "media");
export const webviewMediaRoot = resolve(extensionMediaRoot, "webviews");
/** Docs capture harness pages (survive concurrent extension webview rebuilds). */
export const docsHarnessRoot = resolve(extensionMediaRoot, "docs-harness");
export const presentationAssetsRoot = resolve(
  workspaceRoot,
  "presentations/assets",
);
