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
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

_No releases yet._
