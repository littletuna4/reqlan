import { accessSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { showcases } from "../src/content/showcases.ts";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(rootDir, "out");

const requiredPaths = [
  "index.html",
  "quickstart/index.html",
  "showcase/index.html",
  "404.html",
  ...showcases.map((showcase) => `showcase/${showcase.id}/index.html`),
];

function assertExists(relativePath: string): void {
  const absolutePath = resolve(outDir, relativePath);

  try {
    accessSync(absolutePath);
  } catch {
    throw new Error(`Static export missing required page: ${relativePath}`);
  }
}

for (const relativePath of requiredPaths) {
  assertExists(relativePath);
}

console.log(`Verified ${requiredPaths.length} static pages in ${outDir}`);
