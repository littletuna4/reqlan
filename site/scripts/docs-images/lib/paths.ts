import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const siteRoot = resolve(here, "../../..");
export const workspaceRoot = resolve(siteRoot, "..");
export const extensionRoot = resolve(workspaceRoot, "packages/extension");
export const webviewMediaRoot = resolve(extensionRoot, "media/webviews");
export const presentationAssetsRoot = resolve(
  workspaceRoot,
  "presentations/assets",
);
