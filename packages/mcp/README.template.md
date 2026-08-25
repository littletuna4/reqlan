<p align="center">
  <img src="{{LOGO_URL}}" alt="reqlan logo" width="128" height="128">
</p>

# {{PACKAGE_NAME}}

{{DESCRIPTION}}

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

This package needs the host `@reqlan/analytical` native binary (optional dependency). If pnpm installed every platform package, or none, follow the `@reqlan/cli` README section "Native engine (pnpm)".

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

- [{{SITE_LABEL}}]({{SITE_URL}})
- [{{VSC_LABEL}}]({{VSC_URL}})
- [{{OPENVSX_LABEL}}]({{OPENVSX_URL}})
- [GitHub repository]({{GITHUB_URL}})
- [{{DISCORD_LABEL}}]({{DISCORD_URL}})
- [{{SPONSOR_LABEL}}]({{SPONSOR_URL}})
- [Contact]({{EMAIL_URL}})

## Changelog

{{CHANGELOG}}
