import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { showcases } from "./src/content/showcases";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.SITE_BASE_PATH ?? "/";

const showcaseInputs = Object.fromEntries(
  showcases.map((showcase) => [
    `showcase-${showcase.id}`,
    resolve(rootDir, "showcase", showcase.id, "index.html"),
  ]),
);

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: "out",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(rootDir, "index.html"),
        quickstart: resolve(rootDir, "quickstart/index.html"),
        showcase: resolve(rootDir, "showcase/index.html"),
        ...showcaseInputs,
      },
    },
  },
});
