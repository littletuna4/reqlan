import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const webviewRoot = fileURLToPath(new URL('.', import.meta.url));
const extensionRoot = resolve(webviewRoot, '../..');

export default defineConfig({
    root: webviewRoot,
    plugins: [svelte()],
    build: {
        outDir: resolve(extensionRoot, 'media/webviews/ideas-summary'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(webviewRoot, 'index.html'),
            output: {
                entryFileNames: 'main.js',
                chunkFileNames: 'chunk-[name].js',
                assetFileNames: 'main.[ext]'
            }
        }
    }
});
