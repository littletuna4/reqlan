#!/usr/bin/env node
/**
 * Generate PNGs, favicons, and web manifest from public/logo.svg.
 * Re-run whenever the source SVG changes.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(__dirname, "..");
const publicDir = join(siteRoot, "public");
const sourceLogo = join(publicDir, "logo.svg");

const RENDER_DENSITY = 300;

const pngOutputs = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

const icoSizes = [16, 32, 48];

async function renderLogo(size) {
  return sharp(sourceLogo, { density: RENDER_DENSITY })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function writePng(name, size) {
  const outputPath = join(publicDir, name);
  const buffer = await renderLogo(size);
  await writeFile(outputPath, buffer);
  console.log(`wrote ${name}`);
}

async function writeFaviconIco() {
  const buffers = await Promise.all(icoSizes.map((size) => renderLogo(size)));
  const outputPath = join(publicDir, "favicon.ico");
  await writeFile(outputPath, await toIco(buffers));
  console.log("wrote favicon.ico");
}

async function writeWebManifest() {
  const manifest = {
    name: "reqlan",
    short_name: "reqlan",
    icons: pngOutputs.map(({ name, size }) => ({
      src: `/${name}`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
    display: "standalone",
    background_color: "#1a1209",
    theme_color: "#0371c1",
  };

  const outputPath = join(publicDir, "site.webmanifest");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("wrote site.webmanifest");
}

async function main() {
  await readFile(sourceLogo);

  for (const { name, size } of pngOutputs) {
    await writePng(name, size);
  }

  await writeFaviconIco();
  await writeWebManifest();

  console.log("Image generation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
