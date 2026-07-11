#!/usr/bin/env node
/**
 * Generate extension media from the brand logo SVG.
 * SVG is used in VS Code where allowed; PNG and WebP are generated for fallbacks.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(extensionRoot, "../..");
const mediaDir = join(extensionRoot, "media");
const sourceLogo = join(repoRoot, "site/public/logo.svg");

const RENDER_DENSITY = 300;

/** @type {readonly { readonly name: string; readonly size: number }[]} */
const rasterOutputs = [
  { name: "logo.png", size: 128 },
  { name: "logo-256.png", size: 256 },
  { name: "logo.webp", size: 128 },
];

async function renderLogo(size, format) {
  const pipeline = sharp(sourceLogo, { density: RENDER_DENSITY }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (format === "webp") {
    return pipeline.webp().toBuffer();
  }

  return pipeline.png().toBuffer();
}

async function main() {
  await readFile(sourceLogo);
  await mkdir(mediaDir, { recursive: true });

  const logoSvgTarget = join(mediaDir, "logo.svg");
  await copyFile(sourceLogo, logoSvgTarget);
  console.log("[media] synced logo.svg");

  for (const { name, size } of rasterOutputs) {
    const format = name.endsWith(".webp") ? "webp" : "png";
    const outputPath = join(mediaDir, name);
    const buffer = await renderLogo(size, format);
    await writeFile(outputPath, buffer);
    console.log(`[media] wrote ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
