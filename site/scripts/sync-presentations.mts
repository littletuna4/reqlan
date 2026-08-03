import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonc } from "../src/lib/parse-jsonc.ts";

const siteDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = resolve(siteDir, "..");
const sourceDir = resolve(workspaceRoot, "presentations");
const targetDir = resolve(siteDir, "public", "presentations");

// Player HTML is an App Router page at /presentations/player/ — do not copy
// presentations/player into public (it would collide with the exported page).
const required = [
  "manifest.jsonc",
  "decks/gs-01-why-reqlan.jsonc",
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
    if (
      rel === "package.json" ||
      rel === "README.md" ||
      rel === "pnpm-lock.yaml"
    ) {
      return false;
    }
    // Authored JSONC stays in presentations/; runtime JSON is emitted below.
    if (rel.endsWith(".jsonc")) {
      return false;
    }
    return true;
  },
});

const decksSourceDir = resolve(sourceDir, "decks");
const decksTargetDir = resolve(targetDir, "decks");
mkdirSync(decksTargetDir, { recursive: true });

for (const name of readdirSync(decksSourceDir)) {
  if (!name.endsWith(".jsonc")) continue;
  const deck = parseJsonc(
    readFileSync(join(decksSourceDir, name), "utf8"),
  ) as Record<string, unknown>;
  const outName = name.replace(/\.jsonc$/, ".json");
  writeFileSync(
    join(decksTargetDir, outName),
    `${JSON.stringify(deck, null, 2)}\n`,
  );
}

type Manifest = {
  decks: Array<Record<string, unknown> & { deck?: string }>;
};

const manifest = parseJsonc(
  readFileSync(resolve(sourceDir, "manifest.jsonc"), "utf8"),
) as Manifest;

for (const entry of manifest.decks) {
  if (typeof entry.deck === "string") {
    entry.deck = entry.deck.replace(/\.jsonc$/, ".json");
  }
}

writeFileSync(
  resolve(targetDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

if (existsSync(resolve(targetDir, "player"))) {
  throw new Error("Sync incorrectly copied presentations/player into public");
}

console.log(
  `Synced presentations (JSONC→JSON decks/assets/vendor) → ${targetDir}`,
);
