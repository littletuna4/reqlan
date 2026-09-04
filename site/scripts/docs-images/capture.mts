/**
 * Build extension webviews needed for docs/slide assets and capture PNGs with Playwright.
 * per ["../../../reqlan rq/docs/docs.rq".docs_image_generation]
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

import { CAPTURE_BASE_CSS } from "./lib/capture-css.ts";
import {
  buildDocsWebviews,
  type DocsWebviewId,
} from "./lib/build-webviews.ts";
import { presentationAssetsRoot, webviewMediaRoot } from "./lib/paths.ts";
import { startStaticServer } from "./lib/serve.ts";
import { writeDocsHarnesses } from "./lib/write-harnesses.ts";
import { DOCS_IMAGE_SHOTS } from "./shots/catalog.ts";
import type { DocsShot } from "./shots/types.ts";

const STUB_SVG_IDS = [
  "activity-bar",
  "montage-ide",
  "chat-search",
  "file-link",
] as const;

async function removeStubSvgs(): Promise<void> {
  for (const id of STUB_SVG_IDS) {
    const path = join(presentationAssetsRoot, `${id}.svg`);
    try {
      await unlink(path);
      console.log(`removed stub ${id}.svg`);
    } catch {
      // already gone
    }
  }
}

async function applyCaptureCss(page: Page, shot: DocsShot): Promise<void> {
  const css = `${CAPTURE_BASE_CSS}\n${shot.captureCss ?? ""}`;
  await page.addStyleTag({ content: css });
}

async function captureShot(page: Page, shot: DocsShot, outPath: string): Promise<void> {
  if (shot.captureSelector) {
    const target = page.locator(shot.captureSelector).first();
    await target.waitFor({ state: "visible", timeout: 10_000 });
    await target.screenshot({ path: outPath, type: "png" });
    return;
  }
  await page.screenshot({
    path: outPath,
    type: "png",
    // Never fullPage — keeps framing locked to the configured viewport.
    fullPage: false,
  });
}

async function main(): Promise<void> {
  if (process.env.DOCS_IMAGES_SKIP === "1") {
    console.log("Skipping docs image capture (DOCS_IMAGES_SKIP=1).");
    return;
  }

  const shotFilter = process.env.DOCS_IMAGES_SHOT;
  const shots = shotFilter
    ? DOCS_IMAGE_SHOTS.filter((shot) => shot.id === shotFilter)
    : DOCS_IMAGE_SHOTS;
  if (shotFilter && shots.length === 0) {
    throw new Error(`DOCS_IMAGES_SHOT=${shotFilter} matched no shots`);
  }

  const webviewIds = [
    ...new Set(shots.map((shot) => shot.webview)),
  ] as DocsWebviewId[];

  console.log("Building docs webviews…");
  buildDocsWebviews(webviewIds);

  console.log("Writing docs harness pages…");
  await writeDocsHarnesses(shots);

  await mkdir(presentationAssetsRoot, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (process.env.DOCS_IMAGES_ALLOW_SKIP === "1") {
      console.warn(
        `Playwright Chromium failed to launch; keeping committed PNGs (DOCS_IMAGES_ALLOW_SKIP=1).\n${detail}`,
      );
      return;
    }
    throw new Error(
      `Playwright Chromium failed to launch. On CI run \`pnpm exec playwright install --with-deps chromium\`. Locally install browser deps, or set DOCS_IMAGES_ALLOW_SKIP=1 to keep committed PNGs.\n${detail}`,
    );
  }

  const server = await startStaticServer(webviewMediaRoot);

  try {
    for (const shot of shots) {
      const { width, height, deviceScaleFactor = 2 } = shot.viewport;
      console.log(
        `Capturing ${shot.id} (${width}×${height}@${deviceScaleFactor}x) from ${shot.webview}…`,
      );

      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor,
      });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          pageErrors.push(`console.error: ${msg.text()}`);
        }
      });

      const harnessUrl = `${server.url}/${shot.webview}/docs-${shot.id}.html`;
      await page.goto(harnessUrl, { waitUntil: "load", timeout: 60_000 });

      if (shot.readySelector) {
        const readyTimeout = shot.readyTimeoutMs ?? 30_000;
        try {
          await page.waitForSelector(shot.readySelector, {
            timeout: readyTimeout,
          });
        } catch (error) {
          const appHtml = await page
            .locator("#app")
            .innerHTML()
            .catch(() => "(no #app)");
          const detail = pageErrors.length
            ? pageErrors.join("\n")
            : "(no page errors)";
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${shot.id}: readySelector ${JSON.stringify(shot.readySelector)} failed.\n${reason}\nPage errors:\n${detail}\n#app HTML:\n${appHtml.slice(0, 2000)}`,
          );
        }
      }

      await applyCaptureCss(page, shot);

      if (shot.afterReady) {
        await shot.afterReady(page);
      }

      await page.waitForTimeout(shot.settleMs ?? 400);

      // Re-assert viewport in case UI scripts changed layout metrics.
      await page.setViewportSize({ width, height });

      const outPath = join(presentationAssetsRoot, `${shot.id}.png`);
      await captureShot(page, shot, outPath);
      console.log(`wrote ${outPath}`);
      await page.close();
    }

    await removeStubSvgs();
  } finally {
    await browser.close();
    await server.close();
  }

  console.log("Docs image capture complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
