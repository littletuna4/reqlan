/**
 * Copy the canonical base config JSON Schema into site/public for static hosting.
 * rq:["../../reqlan rq/site/site.rq".sync_config_schema]
 * rq:["../../reqlan rq/extension/host/configuration.rq".configuration_schema_file]
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = resolve(siteDir, "..");
const sourcePath = resolve(
  workspaceRoot,
  "packages/extension/schemas/config.schema.json",
);
const targetPath = resolve(
  siteDir,
  "public/schemas/v1/config.schema.json",
);

if (!existsSync(sourcePath)) {
  throw new Error(`Config schema sync missing source: ${sourcePath}`);
}

mkdirSync(dirname(targetPath), { recursive: true });
cpSync(sourcePath, targetPath);
console.log(`Synced config schema → ${targetPath}`);
