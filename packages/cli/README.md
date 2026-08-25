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

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Discord](https://discord.gg/R487KDVfmA)
- [Sponsor](https://github.com/sponsors/littletuna4)
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

### 0.9.3

#### Patch Changes

- 6f39ab6: cicd tweaks
- b5e5373: cicd test
- 2622292: deploy
- Updated dependencies [6f39ab6]
- Updated dependencies [b5e5373]
- Updated dependencies [2622292]
  - @reqlan/analytical@1.13.3

### 0.9.2

#### Patch Changes

- a18c1ff: decouple extension from core.
- Updated dependencies [a18c1ff]
- Updated dependencies [70715af]
  - @reqlan/analytical@1.13.2

### 0.9.1

#### Patch Changes

- 4a70c69: update core.
- Updated dependencies [4a70c69]
  - @reqlan/analytical@1.13.1

### 0.9.0

#### Minor Changes

- 7c6eca5: add skip gitignored targets

#### Patch Changes

- c219dbe: ci sequencing fix for deployment
- d6b6246: build fix and cicd refinement
- 9b788d2: fix ci
- 900a2fd: testing fixes and cicd changes.
- 70bcb70: Add `check` skip-targets, and rebuild the ideas index when extract rules change so stale inline-code file refs drop.
- 7c6eca5: Add `check --skip-gitignored-targets` so CI can omit missing files that Git ignore rules exclude.
- 70bcb70: Move testin in ci, add ignore check targets to check function for ci environment, fix folder references in ci environemnt.
- 76546b3: fix ci testting.
- Updated dependencies [c219dbe]
- Updated dependencies [7c6eca5]
- Updated dependencies [d6b6246]
- Updated dependencies [9b788d2]
- Updated dependencies [900a2fd]
- Updated dependencies [70bcb70]
- Updated dependencies [7c6eca5]
- Updated dependencies [70bcb70]
- Updated dependencies [76546b3]
  - @reqlan/analytical@1.13.0

### 0.8.0

#### Minor Changes

- 15b6a53: Add `reqlan check` so CI can report unresolved idea, comment, and file references.
- 15b6a53: Add check; and fix broken references.

#### Patch Changes

- Updated dependencies [15b6a53]
- Updated dependencies [15b6a53]
  - @reqlan/analytical@1.12.0

### 0.7.12

#### Patch Changes

- 9571467: Update site; and a few little bug fixes
- Updated dependencies [9571467]
  - @reqlan/analytical@1.11.3

### 0.7.11

#### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.
- Updated dependencies [ae5fbc3]
  - @reqlan/analytical@1.11.2

### 0.7.10

#### Patch Changes

- c6d524e: Useability bug fixes.
- Updated dependencies [c6d524e]
  - @reqlan/analytical@1.11.1

### 0.7.9

#### Patch Changes

- @reqlan/analytical@1.11.0

### 0.7.8

#### Patch Changes

- Updated dependencies [07e7c2f]
  - @reqlan/analytical@1.10.9

### 0.7.7

#### Patch Changes

- Updated dependencies [a315963]
  - @reqlan/analytical@1.10.8

### 0.7.6

#### Patch Changes

- fccc1ea: build matrix in extension build
- Updated dependencies [fccc1ea]
  - @reqlan/analytical@0.10.6

### 0.7.5

#### Patch Changes

- 712ae40: avoid linux in production.
- Updated dependencies [712ae40]
  - @reqlan/analytical@0.10.5

### 0.7.4

#### Patch Changes

- 5348d34: update target binary
- Updated dependencies [5348d34]
  - @reqlan/analytical@0.10.4

### 0.7.3

#### Patch Changes

- Updated dependencies [2860f9f]
  - @reqlan/analytical@0.10.3

### 0.7.2

#### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.
- Updated dependencies [75902d5]
  - @reqlan/analytical@0.10.2

### 0.7.1

#### Patch Changes

- 06e9150: fix build and deps.
- Updated dependencies [06e9150]
  - @reqlan/analytical@0.10.1

### 0.7.0

#### Minor Changes

- e9b7e8a: rust

#### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version
- Updated dependencies [72246b6]
- Updated dependencies [e9b7e8a]
- Updated dependencies [70ccc6f]
  - @reqlan/analytical@0.10.0

### 0.6.1

#### Patch Changes

- 45d37df: Fix Windows CLI startup: dynamic import of `C:\...` is protocol `c:`; use `file://` URLs. Treat drive-letter paths as filesystem paths, not URI schemes.
- Updated dependencies [45d37df]
  - @reqlan/language@1.8.3
  - @reqlan/analytical@0.9.1

### 0.6.0

#### Minor Changes

- 2294beb: minor improvements to graph and search and website

#### Patch Changes

- Updated dependencies [2294beb]
  - @reqlan/analytical@0.9.0

### 0.5.2

#### Patch Changes

- fc3cdb6: fix cicd and release.
- Updated dependencies [fc3cdb6]
  - @reqlan/analytical@0.8.2
  - @reqlan/language@1.8.2

### 0.5.1

#### Patch Changes

- d46b740: Fix missed build and test errors.
- Updated dependencies [d46b740]
  - @reqlan/analytical@0.8.1
  - @reqlan/language@1.8.1

### 0.5.0

#### Minor Changes

- 93368c6: Update exports; add support for wildcard import; update search functionality; add barrel import

#### Patch Changes

- Updated dependencies [93368c6]
  - @reqlan/analytical@0.8.0
  - @reqlan/language@1.8.0

### 0.4.0

#### Minor Changes

- f7023c1: various changes and improvements.

#### Patch Changes

- Updated dependencies [f7023c1]
  - @reqlan/analytical@0.7.0
  - @reqlan/language@1.7.0

### 0.3.3

#### Patch Changes

- Updated dependencies [674da15]
  - @reqlan/analytical@0.6.3

### 0.3.2

#### Patch Changes

- Updated dependencies [eb9da11]
  - @reqlan/language@1.6.2
  - @reqlan/analytical@0.6.2

### 0.3.1

#### Patch Changes

- 0a5649e: update the site base path, and untrack build artifacts
- Updated dependencies [0a5649e]
  - @reqlan/analytical@0.6.1
  - @reqlan/language@1.6.1

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
