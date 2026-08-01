import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = resolve(rootDir, "..");

function run(command: string, args: string[], cwd = rootDir): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Building language, analytical, and CLI packages…");
run("pnpm", ["run", "langium:generate"], workspaceRoot);
run(
  "pnpm",
  [
    "exec",
    "tsc",
    "-b",
    "packages/language/tsconfig.src.json",
    "packages/analytical/tsconfig.json",
    "packages/cli/tsconfig.json",
  ],
  workspaceRoot,
);

console.log("Validating showcase .rq blocks…");
run("tsx", ["scripts/validate-showcase-rq.mts"]);

console.log("Syncing tutorial presentations into public…");
run("tsx", ["scripts/sync-presentations.mts"]);

console.log("Generating syntax highlights…");
run("tsx", ["scripts/generate-highlights.mts"]);

console.log("Building static site…");
run("pnpm", ["exec", "next", "build"]);

console.log("Exporting requirement spec under /spec…");
run("tsx", ["scripts/export-spec.mts"]);

console.log("Verifying static export…");
run("tsx", ["scripts/verify-static-export.mts"]);

console.log("Static site build complete.");
