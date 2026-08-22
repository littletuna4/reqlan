<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/site/public/logo.svg" alt="reqlan logo" width="128" height="128">
</p>

# @reqlan/mcp

MCP server exposing reqlan requirement graph tools

## Features

- Stdio MCP server over `AnalysisApi` — no VS Code host required
- Tools for search, file context, local graph, subtree summary, and completion status
- Shared ideas index at `<workspace>/.reqlan/ideas-index.sqlite` (same path as the VS Code extension and CLI)

## Install

```bash
npm install -g @reqlan/mcp
# or
npx @reqlan/mcp
```

## Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "reqlan": {
      "command": "npx",
      "args": ["-y", "@reqlan/mcp"],
      "env": {
        "REQLAN_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

Set `REQLAN_WORKSPACE` to the workspace root (or run from that directory). Override the storage directory with `REQLAN_INDEX_PATH` when needed.

## Links

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Discord](https://discord.gg/R487KDVfmA)
- [Sponsor](https://github.com/sponsors/littletuna4)
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

### 0.3.2

#### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.
- Updated dependencies [ae5fbc3]
  - @reqlan/analytical@1.11.2

### 0.3.1

#### Patch Changes

- Updated dependencies [c6d524e]
  - @reqlan/analytical@1.11.1

### 0.3.0

#### Minor Changes

- 6036b1a: up

#### Patch Changes

- @reqlan/analytical@1.11.0

### 0.2.9

#### Patch Changes

- Updated dependencies [07e7c2f]
  - @reqlan/analytical@1.10.9

### 0.2.8

#### Patch Changes

- Updated dependencies [a315963]
  - @reqlan/analytical@1.10.8

### 0.2.7

#### Patch Changes

- fccc1ea: build matrix in extension build
- Updated dependencies [fccc1ea]
  - @reqlan/analytical@0.10.6

### 0.2.6

#### Patch Changes

- 712ae40: avoid linux in production.
- Updated dependencies [712ae40]
  - @reqlan/analytical@0.10.5

### 0.2.5

#### Patch Changes

- 5348d34: update target binary
- Updated dependencies [5348d34]
  - @reqlan/analytical@0.10.4

### 0.2.4

#### Patch Changes

- Updated dependencies [2860f9f]
  - @reqlan/analytical@0.10.3

### 0.2.3

#### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.
- Updated dependencies [75902d5]
  - @reqlan/analytical@0.10.2

### 0.2.2

#### Patch Changes

- 6f49b58: try again , with mcp permissions

### 0.2.1

#### Patch Changes

- 06e9150: fix build and deps.
- Updated dependencies [06e9150]
  - @reqlan/analytical@0.10.1

### 0.2.0

#### Minor Changes

- e9b7e8a: rust

#### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version
- Updated dependencies [72246b6]
- Updated dependencies [e9b7e8a]
- Updated dependencies [70ccc6f]
  - @reqlan/analytical@0.10.0

### 0.1.0

#### Minor Changes

- 45d37df: Publish the MCP stdio server to npm as `@reqlan/mcp` on the `mcp/v*` Changesets channel. Install Cursor Skills uses `npx @reqlan/mcp` when the workspace has no local MCP bin.

#### Patch Changes

- Updated dependencies [45d37df]
  - @reqlan/analytical@0.9.1
