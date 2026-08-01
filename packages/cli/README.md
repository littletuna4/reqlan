<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/packages/extension/media/logo.png" alt="reqlan logo" width="128" height="128">
</p>

# @reqlan/cli

CLI for parsing and analysing reqlan requirement graphs

## Features

- `reqlan` / `rq` Clipanion CLI for requirement workspaces
- `parse` — parse a `.rq` file and print diagnostics or an AST summary
- `analyse` / `analyze` — file, idea, or workspace graph analysis via `AnalysisApi`
- `search` — semantic search across indexed requirements (`--json` for scripting)
- `export` / `export html` — multi-file static HTML export of the requirement graph

## Install

```bash
npm install -g @reqlan/cli
# or
npx @reqlan/cli --help
```

## Commands

```bash
reqlan parse <file> [--json]
reqlan analyse [--file <path> | --idea <name>] [--depth <n>] [--cwd <dir>] [--json]
reqlan analyze   # alias of analyse
reqlan search <query> [--limit <n>] [--cwd <dir>] [--json]
reqlan export [--output <dir>] [--name <folder>] [--exclude-secret] [--file <path>] [--cwd <dir>] [--json]
reqlan export html   # same as export
```

Set `REQLAN_WORKSPACE` or pass `--cwd` to override the workspace root.

The ideas index is shared application memory at `<workspace>/.reqlan/ideas-index.sqlite` (same path as the VS Code extension and MCP). Override the storage directory with `REQLAN_INDEX_PATH` when needed.

## Links

- [Site](https://tony.is-a.dev/reqlan)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Contact](mailto:reqlan@tony.is-a.dev)

## Changelog

### 0.1.1

#### Patch Changes

- 1790ce1: Update the landers.
- Updated dependencies [1790ce1]
  - @reqlan/language@1.4.1
  - @reqlan/analytical@0.4.1

### 0.1.0

#### Minor Changes

- 8ac3f82: Minor site showcase fixes, extension search functinoality, cli init.

#### Patch Changes

- Updated dependencies [8ac3f82]
  - @reqlan/analytical@0.4.0
  - @reqlan/language@1.4.0
