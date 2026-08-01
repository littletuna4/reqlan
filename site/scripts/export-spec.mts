/**
 * Export the workspace requirement graph (excluding *.secret.rq) under site/out/spec
 * via the `reqlan export` CLI (AnalysisApi.exportHtml).
 *
 * Passes --url-base so asset/page links resolve with or without a trailing slash,
 * and a header link back to the marketing site home.
 */
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = resolve(siteDir, "..");
const outDir = resolve(siteDir, "out");
const indexStoragePath = resolve(siteDir, ".cache/spec-index");
const cliEntry = resolve(workspaceRoot, "packages/cli/bin/cli.js");

const configuredBase = (process.env.SITE_BASE_PATH ?? "").replace(/\/$/, "");
const urlBase = `${configuredBase}/spec`;
const headerHref = configuredBase ? `${configuredBase}/` : "/";
const headerLabel = "reqlan";

await rm(indexStoragePath, { recursive: true, force: true });
await mkdir(indexStoragePath, { recursive: true });
await mkdir(outDir, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    cliEntry,
    "export",
    "html",
    "--exclude-secret",
    "--cwd",
    workspaceRoot,
    "--output",
    outDir,
    "--name",
    "spec",
    "--url-base",
    urlBase,
    "--header-href",
    headerHref,
    "--header-label",
    headerLabel,
  ],
  {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      REQLAN_INDEX_PATH: indexStoragePath,
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
