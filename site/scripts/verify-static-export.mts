import { accessSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { showcases } from "../src/content/showcases.ts";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(rootDir, "out");
const configuredBase = (process.env.SITE_BASE_PATH ?? "").replace(/\/$/, "");
const specUrlBase = `${configuredBase}/spec`;
const headerHref = configuredBase ? `${configuredBase}/` : "/";

const requiredPaths = [
  "index.html",
  "quickstart/index.html",
  "showcase/index.html",
  "spec/index.html",
  "spec/graph.html",
  "spec/ideas.html",
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

const specIndex = readFileSync(resolve(outDir, "spec/index.html"), "utf8");
if (!specIndex.includes(`class="brand-link" href="${headerHref}"`)) {
  throw new Error(`Spec export missing header link back to ${headerHref}`);
}
if (!specIndex.includes(`href="${specUrlBase}/assets/styles.css"`)) {
  throw new Error(`Spec export missing root-relative asset href under ${specUrlBase}`);
}

console.log(`Verified ${requiredPaths.length} static pages in ${outDir}`);
console.log(`Verified spec header link (${headerHref}) and urlBase (${specUrlBase})`);
