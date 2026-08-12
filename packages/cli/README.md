<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/site/public/logo.svg" alt="reqlan logo" width="128" height="128">
</p>

# @reqlan/cli

CLI for parsing, analysing, and exporting reqlan requirement graphs

## Features

- `reqlan` / `rq` Clipanion CLI for requirement workspaces
- `parse` — parse a `.rq` file and print diagnostics or an AST summary
- `analyse` / `analyze` — file, idea, or workspace graph analysis via `AnalysisApi`
- `search` — semantic search across indexed requirements (`--context`, `--json` for scripting)

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
reqlan search <query> [--limit <n>] [--context <path|path#idea|name>]... [--cwd <dir>] [--json]
```

Set `REQLAN_WORKSPACE` or pass `--cwd` to override the workspace root.

The ideas index is shared application memory at `<workspace>/.reqlan/ideas-index.sqlite` (same path as the VS Code extension and MCP). Override the storage directory with `REQLAN_INDEX_PATH` when needed.

## Links

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

### 0.3.0

#### Minor Changes

- 54a2536: introduce bases, refine config, improvements to summary, site improvements.

#### Patch Changes

- Updated dependencies [54a2536]
  - @reqlan/analytical@0.6.0
  - @reqlan/language@1.6.0

### 0.2.4

#### Patch Changes

- 3e940a2: cicd trigger.
- Updated dependencies [3e940a2]
  - @reqlan/analytical@0.5.4
  - @reqlan/language@1.5.3

### 0.2.3

#### Patch Changes

- 9586a97: package publish trigger
- Updated dependencies [9586a97]
  - @reqlan/analytical@0.5.3
  - @reqlan/language@1.5.2

### 0.2.2

#### Patch Changes

- b905cd0: update npm deployement.
- Updated dependencies [b905cd0]
  - @reqlan/analytical@0.5.2
  - @reqlan/language@1.5.1

### 0.2.1

#### Patch Changes

- Updated dependencies [4f86d2b]
  - @reqlan/analytical@0.5.1

### 0.2.0

#### Minor Changes

- 627d502: updates to cli, site export, site (showing spec), replace welcome screen, temp remove old extension name.

#### Patch Changes

- Updated dependencies [627d502]
  - @reqlan/analytical@0.5.0
  - @reqlan/language@1.5.0

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
