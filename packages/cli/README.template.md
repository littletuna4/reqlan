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
pnpm add -g @reqlan/cli
# or
npx @reqlan/cli --help
```

The CLI needs one host-matching native package (`@reqlan/analytical-<os>-<cpu>`). npm and pnpm must install optional dependencies. `@reqlan/analytical` runs a `postinstall` check and warns when that host package is missing.

### Native engine (pnpm)

Install only the host architecture. Do not keep every platform package. Do not keep none.

`pnpm ls` can list every `@reqlan/analytical-*` optional child from the lockfile. Confirm the host package is on disk (`pnpm -g why @reqlan/analytical-<os>-<cpu>`).

**Every platform package is present** (darwin, linux, and win32 on one machine):

1. Do not use `pnpm add --force`. `--force` installs every optional platform package.
2. Remove a `supportedArchitectures` list that includes other OS or CPU values.
3. Pin this machine, then reinstall:

```bash
node -p "process.platform + ' ' + process.arch"
pnpm remove -g @reqlan/cli
pnpm add -g @reqlan/cli --os <platform> --cpu <arch>
```

Or set in `pnpm-workspace.yaml` / the global pnpm `config.yaml`:

```yaml
supportedArchitectures:
  os: [current]
  cpu: [current]
  libc: [current]
```

Then `pnpm remove -g @reqlan/cli` and `pnpm add -g @reqlan/cli` without `--force`.

**No native package is present** (CLI fails; `pnpm ls` shows none of `@reqlan/analytical-*`):

1. Run `pnpm config get optional`. The value must not be `false`.
2. Remove `--no-optional`, `optional=false`, and `omit=optional`.
3. Remove `ignoredOptionalDependencies` globs that match `@reqlan/analytical-*`.
4. Do not set `supportedArchitectures` to a different OS than this machine.
5. Do not pass `--ignore-scripts`. pnpm 10+ must allow the `@reqlan/analytical` build script if it prompts.
6. Reinstall:

```bash
pnpm remove -g @reqlan/cli
pnpm add -g @reqlan/cli --os <platform> --cpu <arch>
```

Replace `<platform>` and `<arch>` with `process.platform` and `process.arch` (example: `win32` and `x64`).

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
- [{{DISCORD_LABEL}}]({{DISCORD_URL}})
- [{{SPONSOR_LABEL}}]({{SPONSOR_URL}})
- [Contact]({{EMAIL_URL}})

## Changelog

{{CHANGELOG}}
