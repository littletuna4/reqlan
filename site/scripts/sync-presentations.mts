import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = resolve(siteDir, "..");
const sourceDir = resolve(workspaceRoot, "presentations");
const targetDir = resolve(siteDir, "public", "presentations");

// Player HTML is an App Router page at /presentations/player/ — do not copy
// presentations/player into public (it would collide with the exported page).
const required = [
  "manifest.json",
  "decks/gs-01-why-reqlan.json",
  "vendor/reveal.js/reveal.js",
  "vendor/reveal.js/reveal.css",
  "vendor/reveal.js/reset.css",
  "vendor/reveal.js/plugin/highlight/highlight.js",
  "assets/logo.svg",
];

for (const relativePath of required) {
  const absolute = resolve(sourceDir, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Presentations sync missing source file: ${relativePath}`);
  }
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(resolve(siteDir, "public"), { recursive: true });

cpSync(sourceDir, targetDir, {
  recursive: true,
  filter: (src) => {
    const rel = relative(sourceDir, src).replaceAll("\\", "/");
    if (rel === "node_modules" || rel.startsWith("node_modules/")) {
      return false;
    }
    if (rel === "player" || rel.startsWith("player/")) {
      return false;
    }
    if (rel === "package.json" || rel === "README.md" || rel === "pnpm-lock.yaml") {
      return false;
    }
    return true;
  },
});

if (existsSync(resolve(targetDir, "player"))) {
  throw new Error("Sync incorrectly copied presentations/player into public");
}

console.log(`Synced presentations (decks/assets/vendor) → ${targetDir}`);
