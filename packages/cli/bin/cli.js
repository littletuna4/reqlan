#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fsPathToEsmSpecifier } from '../out/esm-path.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
await import(fsPathToEsmSpecifier(join(__dirname, '..', 'out', 'main.js')));
