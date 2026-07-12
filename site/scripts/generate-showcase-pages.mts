import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getShowcase, showcases } from "../src/content/showcases.ts";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const template = `<!doctype html>
<html lang="en" class="h-full antialiased">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{TITLE}} · reqlan</title>
    <meta name="description" content="{{DESCRIPTION}}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
  </head>
  <body class="min-h-full" data-showcase-slug="{{SLUG}}">
    <div id="root"></div>
    <script type="module" src="/src/entries/showcase-detail.tsx"></script>
  </body>
</html>
`;

async function main() {
  for (const showcase of showcases) {
    const detail = getShowcase(showcase.id);
    if (!detail) {
      throw new Error(`Missing showcase content for slug: ${showcase.id}`);
    }

    const html = template
      .replaceAll("{{SLUG}}", detail.id)
      .replaceAll("{{TITLE}}", detail.title)
      .replaceAll("{{DESCRIPTION}}", detail.summary);

    const dir = resolve(rootDir, "showcase", showcase.id);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "index.html"), html, "utf8");
  }

  console.log(`Generated ${showcases.length} showcase detail pages`);
}

await main();
