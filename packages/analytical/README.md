<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/site/public/logo.svg" alt="reqlan logo" width="128" height="128">
</p>

# @reqlan/analytical

Native requirement graph index and analysis API for reqlan

## Features

- Headless requirement graph index (rusqlite via napi) over parsed `.rq` workspaces
- Shared application memory under `<workspace>/.reqlan` (ideas-index.sqlite) for extension, CLI, and MCP
- Analysers for semantic search, file context, local graphs, and completion status
- `AnalysisApi` façade shared by the CLI and MCP server
- Context-model helpers for composing focused requirement context

## Install

```bash
npm install @reqlan/analytical
```

## Links

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Discord](https://discord.gg/R487KDVfmA)
- [Sponsor](https://github.com/sponsors/littletuna4)
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

### 1.11.2

#### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.

### 1.11.1

#### Patch Changes

- c6d524e: Useability bug fixes.

### 1.11.0

### 1.10.9

#### Patch Changes

- 07e7c2f: change deployment sequencing

### 1.10.8

#### Patch Changes

- a315963: Keep the VS Code extension on the same semver as `@reqlan/analytical` and its platform native packages. Marketplace already published 1.10.x, so the shared number stays on that line rather than 0.10.x.

### 0.10.6

#### Patch Changes

- fccc1ea: build matrix in extension build

### 0.10.5

#### Patch Changes

- 712ae40: avoid linux in production.

### 0.10.4

#### Patch Changes

- 5348d34: update target binary

### 0.10.3

#### Patch Changes

- 2860f9f: deployment binary availability fix attempt

### 0.10.2

#### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.

### 0.10.1

#### Patch Changes

- 06e9150: fix build and deps.

### 0.10.0

#### Minor Changes

- e9b7e8a: rust

#### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version

### 0.9.1

#### Patch Changes

- 45d37df: Fix Windows CLI startup: dynamic import of `C:\...` is protocol `c:`; use `file://` URLs. Treat drive-letter paths as filesystem paths, not URI schemes.
- Updated dependencies [45d37df]
  - @reqlan/language@1.8.3

### 0.9.0

#### Minor Changes

- 2294beb: minor improvements to graph and search and website

### 0.8.2

#### Patch Changes

- fc3cdb6: fix cicd and release.
- Updated dependencies [fc3cdb6]
  - @reqlan/language@1.8.2

### 0.8.1

#### Patch Changes

- d46b740: Fix missed build and test errors.
- Updated dependencies [d46b740]
  - @reqlan/language@1.8.1

### 0.8.0

#### Minor Changes

- 93368c6: Update exports; add support for wildcard import; update search functionality; add barrel import

#### Patch Changes

- Updated dependencies [93368c6]
  - @reqlan/language@1.8.0

### 0.7.0

#### Minor Changes

- f7023c1: various changes and improvements.

#### Patch Changes

- Updated dependencies [f7023c1]
  - @reqlan/language@1.7.0

### 0.6.3

#### Patch Changes

- 674da15: fix image in readme, update site copy, add graph navigator to landing.

### 0.6.2

#### Patch Changes

- Updated dependencies [eb9da11]
  - @reqlan/language@1.6.2

### 0.6.1

#### Patch Changes

- 0a5649e: update the site base path, and untrack build artifacts
- Updated dependencies [0a5649e]
  - @reqlan/language@1.6.1

### 0.6.0

#### Minor Changes

- 54a2536: introduce bases, refine config, improvements to summary, site improvements.

#### Patch Changes

- Updated dependencies [54a2536]
  - @reqlan/language@1.6.0

### 0.5.4

#### Patch Changes

- 3e940a2: cicd trigger.
- Updated dependencies [3e940a2]
  - @reqlan/language@1.5.3

### 0.5.3

#### Patch Changes

- 9586a97: package publish trigger
- Updated dependencies [9586a97]
  - @reqlan/language@1.5.2

### 0.5.2

#### Patch Changes

- b905cd0: update npm deployement.
- Updated dependencies [b905cd0]
  - @reqlan/language@1.5.1

### 0.5.1

#### Patch Changes

- 4f86d2b: fix the graph rendering.

### 0.5.0

#### Minor Changes

- 627d502: updates to cli, site export, site (showing spec), replace welcome screen, temp remove old extension name.

#### Patch Changes

- Updated dependencies [627d502]
  - @reqlan/language@1.5.0

### 0.4.1

#### Patch Changes

- 1790ce1: Update the landers.
- Updated dependencies [1790ce1]
  - @reqlan/language@1.4.1

### 0.4.0

#### Minor Changes

- 8ac3f82: Minor site showcase fixes, extension search functinoality, cli init.

#### Patch Changes

- Updated dependencies [8ac3f82]
  - @reqlan/language@1.4.0

### 0.3.0

#### Minor Changes

- 4b9d33b: brevity improvements in activitybar. graph interactivity improvements. various syntactic fixes

#### Patch Changes

- Updated dependencies [4b9d33b]
  - @reqlan/language@1.3.0

### 0.2.1

#### Patch Changes

- Updated dependencies [e5389ba]
  - @reqlan/language@1.2.0

### 0.2.0

#### Minor Changes

- e56ac74: onboarding, index corruption recovery, syntax edge case support, inlay hint development

#### Patch Changes

- Updated dependencies [e56ac74]
  - @reqlan/language@1.1.0

### 0.1.4

#### Patch Changes

- b8a50cd: minor fixes
- Updated dependencies [b8a50cd]
  - @reqlan/language@1.0.1

### 0.1.3

#### Patch Changes

- Updated dependencies [931fc87]
  - @reqlan/language@1.0.0

### 0.1.2

#### Patch Changes

- fcb99a0: Various vibed changes
- Updated dependencies [fcb99a0]
  - @reqlan/language@0.1.2

### 0.1.1

#### Patch Changes

- d9f43be: remove :memory:
- Updated dependencies [d9f43be]
  - @reqlan/language@0.1.1

### 0.1.0

#### Minor Changes

- 65840f4: update to extension activity bar; update to the syntax. addition of testing. bidirectional references.

#### Patch Changes

- Updated dependencies [65840f4]
  - @reqlan/language@0.1.0

### 0.0.5

#### Patch Changes

- a6c2066: Branding change
- Updated dependencies [a6c2066]
  - @reqlan/language@0.0.5

### 0.0.4

#### Patch Changes

- Updated dependencies [020cd59]
  - @reqlan/language@0.0.4

### 0.0.3

#### Patch Changes

- Updated dependencies [66e5027]
  - @reqlan/language@0.0.3

### 0.0.2

#### Patch Changes

- f6bae00: rebase the semver to the manual version
- d50f988: test increment of \*
- Updated dependencies [f6bae00]
- Updated dependencies [d50f988]
  - @reqlan/language@0.0.2
