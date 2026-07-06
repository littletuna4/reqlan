#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec concurrently -n webviews,tsc,esbuild,syntax -c magenta,blue,yellow,cyan \
    "vite build --config webviews/ideas-summary/vite.config.ts --watch" \
    "tsc -b tsconfig.json --watch" \
    "node esbuild.mjs --watch" \
    "node watch-syntax.mjs"
