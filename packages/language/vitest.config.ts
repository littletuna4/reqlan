/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@reqlan/analytical/core': join(here, '../analytical/src/native/index.ts')
        }
    },
    test: {
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts']
    }
});
