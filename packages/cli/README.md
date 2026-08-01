# reqlan CLI (`reqlan` / `rq`)

Command-line interface for parsing `.rq` files and analysing the workspace requirement graph.

## Commands

```bash
reqlan parse <file> [--json]
reqlan analyse [--file <path> | --idea <name>] [--depth <n>] [--cwd <dir>] [--json]
reqlan analyze   # alias of analyse
reqlan search <query> [--limit <n>] [--cwd <dir>] [--json]
```

Workspace-scoped commands use `@reqlan/analytical`'s `AnalysisApi` (same headless path as MCP). Set `REQLAN_WORKSPACE` or pass `--cwd` to override the workspace root.

## Build

From the monorepo root:

```bash
pnpm run build
# or
pnpm --filter @reqlan/cli run build
node packages/cli/bin/cli.js --help
```
