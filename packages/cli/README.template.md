<p align="center">
  <img src="{{LOGO_URL}}" alt="reqlan logo" width="128" height="128">
</p>

# {{PACKAGE_NAME}}

{{DESCRIPTION}}

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

- [{{SITE_LABEL}}]({{SITE_URL}})
- [{{VSC_LABEL}}]({{VSC_URL}})
- [{{OPENVSX_LABEL}}]({{OPENVSX_URL}})
- [GitHub repository]({{GITHUB_URL}})
- [Contact]({{EMAIL_URL}})

## Changelog

{{CHANGELOG}}
