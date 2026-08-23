<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/packages/extension/media/logo.png" alt="reqlan logo" width="128" height="128">
</p>

# reqlan language support

Language support for the reqlan language

## Features

- Syntax highlighting and Language Server Protocol support for `.rq` requirement files
- Requirement graph navigation, semantic search, and analysis commands
- Ideas summary webview with graph and status views
- `@reqlan` chat participant, language-model tools, and Cursor skills for AI-assisted requirement work

## Links

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Discord](https://discord.gg/R487KDVfmA)
- [Sponsor](https://github.com/sponsors/littletuna4)
- [Contact](mailto:reqlan@reqlan.com)

## Changelog

### 1.12.0

#### Minor Changes

- 15b6a53: Add check; and fix broken references.

#### Patch Changes

- Updated dependencies [15b6a53]
- Updated dependencies [15b6a53]
  - @reqlan/analytical@1.12.0
  - @reqlan/language@1.10.0

### 1.11.3

#### Patch Changes

- 9571467: Update site; and a few little bug fixes
- Updated dependencies [9571467]
  - @reqlan/analytical@1.11.3
  - @reqlan/language@1.9.7

### 1.11.2

#### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.
- Updated dependencies [ae5fbc3]
  - @reqlan/analytical@1.11.2
  - @reqlan/language@1.9.6

### 1.11.1

#### Patch Changes

- c6d524e: Useability bug fixes.
- Updated dependencies [c6d524e]
  - @reqlan/analytical@1.11.1
  - @reqlan/language@1.9.5

### 1.11.0

#### Minor Changes

- 6036b1a: up

#### Patch Changes

- @reqlan/analytical@1.11.0

### 1.10.9

#### Patch Changes

- Updated dependencies [07e7c2f]
  - @reqlan/analytical@1.10.9

### 1.10.8

#### Patch Changes

- a315963: Keep the VS Code extension on the same semver as `@reqlan/analytical` and its platform native packages. Marketplace already published 1.10.x, so the shared number stays on that line rather than 0.10.x.
- Updated dependencies [a315963]
  - @reqlan/analytical@1.10.8

### 1.10.7

#### Patch Changes

- fccc1ea: build matrix in extension build
- Updated dependencies [fccc1ea]
  - @reqlan/analytical@0.10.6
  - @reqlan/language@1.9.4

### 1.10.6

#### Patch Changes

- 712ae40: avoid linux in production.
- Updated dependencies [712ae40]
  - @reqlan/analytical@0.10.5
  - @reqlan/language@1.9.3

### 1.10.5

#### Patch Changes

- 5348d34: update target binary
- Updated dependencies [5348d34]
  - @reqlan/analytical@0.10.4

### 1.10.4

#### Patch Changes

- 2860f9f: deployment binary availability fix attempt
- Updated dependencies [2860f9f]
  - @reqlan/analytical@0.10.3

### 1.10.3

#### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.
- Updated dependencies [75902d5]
  - @reqlan/analytical@0.10.2
  - @reqlan/language@1.9.2

### 1.10.2

#### Patch Changes

- 597f6bf: No longer build the site in cicd - no need.

### 1.10.1

#### Patch Changes

- 06e9150: fix build and deps.
- Updated dependencies [06e9150]
  - @reqlan/analytical@0.10.1
  - @reqlan/language@1.9.1

### 1.10.0

#### Minor Changes

- e9b7e8a: rust

#### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version
- Updated dependencies [72246b6]
- Updated dependencies [e9b7e8a]
- Updated dependencies [70ccc6f]
  - @reqlan/analytical@0.10.0
  - @reqlan/language@1.9.0

### 1.9.2

#### Patch Changes

- 45d37df: Publish the MCP stdio server to npm as `@reqlan/mcp` on the `mcp/v*` Changesets channel. Install Cursor Skills uses `npx @reqlan/mcp` when the workspace has no local MCP bin.
- Updated dependencies [45d37df]
  - @reqlan/language@1.8.3
  - @reqlan/analytical@0.9.1

### 1.9.1

#### Patch Changes

- 4dbb28e: update timeout.

### 1.9.0

#### Minor Changes

- 2294beb: minor improvements to graph and search and website

#### Patch Changes

- Updated dependencies [2294beb]
  - @reqlan/analytical@0.9.0

### 1.8.2

#### Patch Changes

- fc3cdb6: fix cicd and release.
- Updated dependencies [fc3cdb6]
  - @reqlan/analytical@0.8.2
  - @reqlan/language@1.8.2

### 1.8.1

#### Patch Changes

- d46b740: Fix missed build and test errors.
- Updated dependencies [d46b740]
  - @reqlan/analytical@0.8.1
  - @reqlan/language@1.8.1

### 1.8.0

#### Minor Changes

- 93368c6: Update exports; add support for wildcard import; update search functionality; add barrel import

#### Patch Changes

- Updated dependencies [93368c6]
  - @reqlan/analytical@0.8.0
  - @reqlan/language@1.8.0

### 1.7.0

#### Minor Changes

- f7023c1: various changes and improvements.

#### Patch Changes

- Updated dependencies [f7023c1]
  - @reqlan/analytical@0.7.0
  - @reqlan/language@1.7.0

### 1.6.5

#### Patch Changes

- 0bf2fb6: Make extension activation non-blocking so the Context sidebar and commands become available immediately; start indexing and the language server in the background afterward.

### 1.6.4

#### Patch Changes

- 7ccb4f2: update svg to png

### 1.6.3

#### Patch Changes

- 674da15: fix image in readme, update site copy, add graph navigator to landing.
- Updated dependencies [674da15]
  - @reqlan/analytical@0.6.3

### 1.6.2

#### Patch Changes

- eb9da11: test references fix
- Updated dependencies [eb9da11]
  - @reqlan/language@1.6.2
  - @reqlan/analytical@0.6.2

### 1.6.1

#### Patch Changes

- 0a5649e: update the site base path, and untrack build artifacts
- Updated dependencies [0a5649e]
  - @reqlan/analytical@0.6.1
  - @reqlan/language@1.6.1

### 1.6.0

#### Minor Changes

- 54a2536: introduce bases, refine config, improvements to summary, site improvements.

#### Patch Changes

- Updated dependencies [54a2536]
  - @reqlan/analytical@0.6.0
  - @reqlan/language@1.6.0

### 1.5.6

#### Patch Changes

- d440fbe: deployment improvements. add npm package references to deployement.

### 1.5.5

#### Patch Changes

- 0cf3f8d: initilialise tutorial in site.

### 1.5.4

#### Patch Changes

- Updated dependencies [3e940a2]
  - @reqlan/analytical@0.5.4
  - @reqlan/language@1.5.3

### 1.5.3

#### Patch Changes

- Updated dependencies [9586a97]
  - @reqlan/analytical@0.5.3
  - @reqlan/language@1.5.2

### 1.5.2

#### Patch Changes

- Updated dependencies [b905cd0]
  - @reqlan/analytical@0.5.2
  - @reqlan/language@1.5.1

### 1.5.1

#### Patch Changes

- 4f86d2b: fix the graph rendering.
- Updated dependencies [4f86d2b]
  - @reqlan/analytical@0.5.1

### 1.5.0

#### Minor Changes

- 627d502: updates to cli, site export, site (showing spec), replace welcome screen, temp remove old extension name.

#### Patch Changes

- Updated dependencies [627d502]
  - @reqlan/analytical@0.5.0
  - @reqlan/language@1.5.0

### 1.4.1

#### Patch Changes

- 3a051bd: unused name
- 1790ce1: Update the landers.
- Updated dependencies [1790ce1]
  - @reqlan/language@1.4.1
  - @reqlan/analytical@0.4.1

### 1.4.0

#### Minor Changes

- 8ac3f82: Minor site showcase fixes, extension search functinoality, cli init.

#### Patch Changes

- Updated dependencies [8ac3f82]
  - @reqlan/analytical@0.4.0
  - @reqlan/language@1.4.0

### 1.3.0

#### Minor Changes

- 4b9d33b: brevity improvements in activitybar. graph interactivity improvements. various syntactic fixes

#### Patch Changes

- Updated dependencies [4b9d33b]
  - @reqlan/analytical@0.3.0
  - @reqlan/language@1.3.0

### 1.2.0

#### Minor Changes

- e5389ba: Improve import ergonomics and code completion.

#### Patch Changes

- Updated dependencies [e5389ba]
  - @reqlan/language@1.2.0
  - @reqlan/analytical@0.2.1

### 1.1.0

#### Minor Changes

- e56ac74: onboarding, index corruption recovery, syntax edge case support, inlay hint development

#### Patch Changes

- Updated dependencies [e56ac74]
  - @reqlan/analytical@0.2.0
  - @reqlan/language@1.1.0

### 1.0.1

#### Patch Changes

- b8a50cd: minor fixes
- Updated dependencies [b8a50cd]
  - @reqlan/analytical@0.1.4
  - @reqlan/language@1.0.1

### 1.0.0

#### Major Changes

- 931fc87: build fix

#### Patch Changes

- Updated dependencies [931fc87]
  - @reqlan/language@1.0.0
  - @reqlan/analytical@0.1.3

### 0.1.2

#### Patch Changes

- fcb99a0: Various vibed changes
- Updated dependencies [fcb99a0]
  - @reqlan/analytical@0.1.2
  - @reqlan/language@0.1.2

### 0.1.1

#### Patch Changes

- d9f43be: remove :memory:
- Updated dependencies [d9f43be]
  - @reqlan/analytical@0.1.1
  - @reqlan/language@0.1.1

### 0.1.0

#### Minor Changes

- 65840f4: update to extension activity bar; update to the syntax. addition of testing. bidirectional references.

#### Patch Changes

- ea699c2: Add file icon; add refactor support; chat participant bug fixes.
- Updated dependencies [65840f4]
  - @reqlan/analytical@0.1.0
  - @reqlan/language@0.1.0

### 0.0.11

#### Patch Changes

- a6c2066: Branding change
- Updated dependencies [a6c2066]
  - @reqlan/analytical@0.0.5
  - @reqlan/language@0.0.5

### 0.0.10

#### Patch Changes

- 020cd59: Fix blocking build issues and update some of the physics
- Updated dependencies [020cd59]
  - @reqlan/language@0.0.4
  - @reqlan/analytical@0.0.4

### 0.0.9

#### Patch Changes

- 66e5027: updates to animation behaviour; and some grammar/language tweaks
- Updated dependencies [66e5027]
  - @reqlan/language@0.0.3
  - @reqlan/analytical@0.0.3

### 0.0.8

#### Patch Changes

- f6bae00: rebase the semver to the manual version
- d50f988: test increment of \*
- Updated dependencies [f6bae00]
- Updated dependencies [d50f988]
  - @reqlan/analytical@0.0.2
  - @reqlan/language@0.0.2
