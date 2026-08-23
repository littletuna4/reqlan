# @reqlan/analytical

## 1.13.3

### Patch Changes

- 6f39ab6: cicd tweaks
- b5e5373: cicd test
- 2622292: deploy

## 1.13.2

### Patch Changes

- a18c1ff: decouple extension from core.
- 70715af: bump

## 1.13.1

### Patch Changes

- 4a70c69: update core.

## 1.13.0

### Minor Changes

- 7c6eca5: add skip gitignored targets

### Patch Changes

- c219dbe: ci sequencing fix for deployment
- d6b6246: build fix and cicd refinement
- 9b788d2: fix ci
- 900a2fd: testing fixes and cicd changes.
- 70bcb70: Add `check` skip-targets, and rebuild the ideas index when extract rules change so stale inline-code file refs drop.
- 7c6eca5: Add `check --skip-gitignored-targets` so CI can omit missing files that Git ignore rules exclude.
- 70bcb70: Move testin in ci, add ignore check targets to check function for ci environment, fix folder references in ci environemnt.
- 76546b3: fix ci testting.

## 1.12.0

### Minor Changes

- 15b6a53: Add check; and fix broken references.

### Patch Changes

- 15b6a53: Add `reqlan check` so CI can report unresolved idea, comment, and file references.

## 1.11.3

### Patch Changes

- 9571467: Update site; and a few little bug fixes

## 1.11.2

### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.

## 1.11.1

### Patch Changes

- c6d524e: Useability bug fixes.

## 1.11.0

## 1.10.9

### Patch Changes

- 07e7c2f: change deployment sequencing

## 1.10.8

### Patch Changes

- a315963: Keep the VS Code extension on the same semver as `@reqlan/analytical` and its platform native packages. Marketplace already published 1.10.x, so the shared number stays on that line rather than 0.10.x.

## 0.10.6

### Patch Changes

- fccc1ea: build matrix in extension build

## 0.10.5

### Patch Changes

- 712ae40: avoid linux in production.

## 0.10.4

### Patch Changes

- 5348d34: update target binary

## 0.10.3

### Patch Changes

- 2860f9f: deployment binary availability fix attempt

## 0.10.2

### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.

## 0.10.1

### Patch Changes

- 06e9150: fix build and deps.

## 0.10.0

### Minor Changes

- e9b7e8a: rust

### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version

## 0.9.1

### Patch Changes

- 45d37df: Fix Windows CLI startup: dynamic import of `C:\...` is protocol `c:`; use `file://` URLs. Treat drive-letter paths as filesystem paths, not URI schemes.
- Updated dependencies [45d37df]
  - @reqlan/language@1.8.3

## 0.9.0

### Minor Changes

- 2294beb: minor improvements to graph and search and website

## 0.8.2

### Patch Changes

- fc3cdb6: fix cicd and release.
- Updated dependencies [fc3cdb6]
  - @reqlan/language@1.8.2

## 0.8.1

### Patch Changes

- d46b740: Fix missed build and test errors.
- Updated dependencies [d46b740]
  - @reqlan/language@1.8.1

## 0.8.0

### Minor Changes

- 93368c6: Update exports; add support for wildcard import; update search functionality; add barrel import

### Patch Changes

- Updated dependencies [93368c6]
  - @reqlan/language@1.8.0

## 0.7.0

### Minor Changes

- f7023c1: various changes and improvements.

### Patch Changes

- Updated dependencies [f7023c1]
  - @reqlan/language@1.7.0

## 0.6.3

### Patch Changes

- 674da15: fix image in readme, update site copy, add graph navigator to landing.

## 0.6.2

### Patch Changes

- Updated dependencies [eb9da11]
  - @reqlan/language@1.6.2

## 0.6.1

### Patch Changes

- 0a5649e: update the site base path, and untrack build artifacts
- Updated dependencies [0a5649e]
  - @reqlan/language@1.6.1

## 0.6.0

### Minor Changes

- 54a2536: introduce bases, refine config, improvements to summary, site improvements.

### Patch Changes

- Updated dependencies [54a2536]
  - @reqlan/language@1.6.0

## 0.5.4

### Patch Changes

- 3e940a2: cicd trigger.
- Updated dependencies [3e940a2]
  - @reqlan/language@1.5.3

## 0.5.3

### Patch Changes

- 9586a97: package publish trigger
- Updated dependencies [9586a97]
  - @reqlan/language@1.5.2

## 0.5.2

### Patch Changes

- b905cd0: update npm deployement.
- Updated dependencies [b905cd0]
  - @reqlan/language@1.5.1

## 0.5.1

### Patch Changes

- 4f86d2b: fix the graph rendering.

## 0.5.0

### Minor Changes

- 627d502: updates to cli, site export, site (showing spec), replace welcome screen, temp remove old extension name.

### Patch Changes

- Updated dependencies [627d502]
  - @reqlan/language@1.5.0

## 0.4.1

### Patch Changes

- 1790ce1: Update the landers.
- Updated dependencies [1790ce1]
  - @reqlan/language@1.4.1

## 0.4.0

### Minor Changes

- 8ac3f82: Minor site showcase fixes, extension search functinoality, cli init.

### Patch Changes

- Updated dependencies [8ac3f82]
  - @reqlan/language@1.4.0

## 0.3.0

### Minor Changes

- 4b9d33b: brevity improvements in activitybar. graph interactivity improvements. various syntactic fixes

### Patch Changes

- Updated dependencies [4b9d33b]
  - @reqlan/language@1.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [e5389ba]
  - @reqlan/language@1.2.0

## 0.2.0

### Minor Changes

- e56ac74: onboarding, index corruption recovery, syntax edge case support, inlay hint development

### Patch Changes

- Updated dependencies [e56ac74]
  - @reqlan/language@1.1.0

## 0.1.4

### Patch Changes

- b8a50cd: minor fixes
- Updated dependencies [b8a50cd]
  - @reqlan/language@1.0.1

## 0.1.3

### Patch Changes

- Updated dependencies [931fc87]
  - @reqlan/language@1.0.0

## 0.1.2

### Patch Changes

- fcb99a0: Various vibed changes
- Updated dependencies [fcb99a0]
  - @reqlan/language@0.1.2

## 0.1.1

### Patch Changes

- d9f43be: remove :memory:
- Updated dependencies [d9f43be]
  - @reqlan/language@0.1.1

## 0.1.0

### Minor Changes

- 65840f4: update to extension activity bar; update to the syntax. addition of testing. bidirectional references.

### Patch Changes

- Updated dependencies [65840f4]
  - @reqlan/language@0.1.0

## 0.0.5

### Patch Changes

- a6c2066: Branding change
- Updated dependencies [a6c2066]
  - @reqlan/language@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [020cd59]
  - @reqlan/language@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [66e5027]
  - @reqlan/language@0.0.3

## 0.0.2

### Patch Changes

- f6bae00: rebase the semver to the manual version
- d50f988: test increment of \*
- Updated dependencies [f6bae00]
- Updated dependencies [d50f988]
  - @reqlan/language@0.0.2
