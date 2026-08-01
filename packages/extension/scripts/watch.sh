#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec concurrently -n webviews,activity,onboarding,tsc,esbuild,syntax -c magenta,green,red,blue,yellow,cyan \
    "vite build --config webviews/ideas-summary/vite.config.ts --watch" \
    "vite build --config webviews/activity-bar/vite.config.ts --watch" \
    "vite build --config webviews/onboarding/vite.config.ts --watch" \
    "tsc -b tsconfig.json --watch" \
    "node esbuild.mjs --watch" \
    "node watch-syntax.mjs"
