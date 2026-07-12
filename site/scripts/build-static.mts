import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Generating syntax highlights…");
run("tsx", ["scripts/generate-highlights.mts"]);

console.log("Generating showcase detail pages…");
run("tsx", ["scripts/generate-showcase-pages.mts"]);

console.log("Building static site…");
run("pnpm", ["exec", "vite", "build"]);

console.log("Verifying static export…");
run("tsx", ["scripts/verify-static-export.mts"]);

console.log("Static site build complete.");
