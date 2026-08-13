#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(__dirname, '..', 'out', 'main.js')).href);
