import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const extensionRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [svelte()],
    build: {
        outDir: `${extensionRoot}/media/webviews/ideas-summary`,
        emptyOutDir: true,
        rollupOptions: {
            input: 'index.html',
            output: {
                entryFileNames: 'main.js',
                chunkFileNames: 'chunk-[name].js',
                assetFileNames: 'main.[ext]'
            }
        }
    }
});
