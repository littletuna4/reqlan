#!/usr/bin/env bash
# Idempotent Cloud Agent install for the reqlan workspace.
# Runs after checkout. Exits when finished.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

export RUSTUP_HOME=/usr/local/rustup
export CARGO_HOME=/usr/local/cargo
export PATH="${CARGO_HOME}/bin:${PATH}"
hash -r

rustup toolchain install stable --profile minimal --component rustfmt,clippy
rustup default stable

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@12.10.1 --activate
fi

echo "node $(node -v) ($(command -v node))"
echo "pnpm $(pnpm -v) ($(command -v pnpm))"
echo "rustc $(rustc --version)"

pnpm install --frozen-lockfile
node scripts/ensure-host-native.mjs
pnpm run build:tsc
