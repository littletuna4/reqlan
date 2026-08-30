# @reqlan/cli

## 0.10.0

### Minor Changes

- f505b95: Add click: local graph slice with SQLite session keys so CLI/MCP agents do not resurface the same ideas. Configurable `click.maxSessions` (default 100) evicts by last touch.
- f3fd1ae: add click
- 3b978db: update code completion, comment fencing, add install warning
- 315d4b1: improve caching and lessons.

### Patch Changes

- 3b978db: Warn on a published install when the host native optionalDependency is missing, and document how to go from every-platform or no-native pnpm installs to the host arch only.
- 082ee6a: fix reference issues
- fc827cf: fmt
- Updated dependencies [f505b95]
- Updated dependencies [f3fd1ae]
- Updated dependencies [3b978db]
- Updated dependencies [3b978db]
- Updated dependencies [082ee6a]
- Updated dependencies [315d4b1]
- Updated dependencies [fc827cf]
  - @reqlan/analytical@1.14.0

## 0.9.4

### Patch Changes

- e388596: cicd changes
- Updated dependencies [e388596]
  - @reqlan/analytical@1.13.4

## 0.9.3

### Patch Changes

- 6f39ab6: cicd tweaks
- b5e5373: cicd test
- 2622292: deploy
- Updated dependencies [6f39ab6]
- Updated dependencies [b5e5373]
- Updated dependencies [2622292]
  - @reqlan/analytical@1.13.3

## 0.9.2

### Patch Changes

- a18c1ff: decouple extension from core.
- Updated dependencies [a18c1ff]
- Updated dependencies [70715af]
  - @reqlan/analytical@1.13.2

## 0.9.1

### Patch Changes

- 4a70c69: update core.
- Updated dependencies [4a70c69]
  - @reqlan/analytical@1.13.1

## 0.9.0

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

## 0.8.0

### Minor Changes

- 15b6a53: Add `reqlan check` so CI can report unresolved idea, comment, and file references.
- 15b6a53: Add check; and fix broken references.

### Patch Changes

- Updated dependencies [15b6a53]
- Updated dependencies [15b6a53]
  - @reqlan/analytical@1.12.0

## 0.7.12

### Patch Changes

- 9571467: Update site; and a few little bug fixes
- Updated dependencies [9571467]
  - @reqlan/analytical@1.11.3

## 0.7.11

### Patch Changes

- ae5fbc3: Publish test distribution fixes, click idea development.
- Updated dependencies [ae5fbc3]
  - @reqlan/analytical@1.11.2

## 0.7.10

### Patch Changes

- c6d524e: Useability bug fixes.
- Updated dependencies [c6d524e]
  - @reqlan/analytical@1.11.1

## 0.7.9

### Patch Changes

- @reqlan/analytical@1.11.0

## 0.7.8

### Patch Changes

- Updated dependencies [07e7c2f]
  - @reqlan/analytical@1.10.9

## 0.7.7

### Patch Changes

- Updated dependencies [a315963]
  - @reqlan/analytical@1.10.8

## 0.7.6

### Patch Changes

- fccc1ea: build matrix in extension build
- Updated dependencies [fccc1ea]
  - @reqlan/analytical@0.10.6

## 0.7.5

### Patch Changes

- 712ae40: avoid linux in production.
- Updated dependencies [712ae40]
  - @reqlan/analytical@0.10.5

## 0.7.4

### Patch Changes

- 5348d34: update target binary
- Updated dependencies [5348d34]
  - @reqlan/analytical@0.10.4

## 0.7.3

### Patch Changes

- Updated dependencies [2860f9f]
  - @reqlan/analytical@0.10.3

## 0.7.2

### Patch Changes

- 75902d5: fix tests; and decouple golden corpus.
- Updated dependencies [75902d5]
  - @reqlan/analytical@0.10.2

## 0.7.1

### Patch Changes

- 06e9150: fix build and deps.
- Updated dependencies [06e9150]
  - @reqlan/analytical@0.10.1

## 0.7.0

### Minor Changes

- e9b7e8a: rust

### Patch Changes

- 72246b6: up pnpm
- 70ccc6f: up pnpm version
- Updated dependencies [72246b6]
- Updated dependencies [e9b7e8a]
- Updated dependencies [70ccc6f]
  - @reqlan/analytical@0.10.0

## 0.6.1

### Patch Changes

- 45d37df: Fix Windows CLI startup: dynamic import of `C:\...` is protocol `c:`; use `file://` URLs. Treat drive-letter paths as filesystem paths, not URI schemes.
- Updated dependencies [45d37df]
  - @reqlan/language@1.8.3
  - @reqlan/analytical@0.9.1

## 0.6.0

### Minor Changes

- 2294beb: minor improvements to graph and search and website

### Patch Changes

- Updated dependencies [2294beb]
  - @reqlan/analytical@0.9.0

## 0.5.2

### Patch Changes

- fc3cdb6: fix cicd and release.
- Updated dependencies [fc3cdb6]
  - @reqlan/analytical@0.8.2
  - @reqlan/language@1.8.2

## 0.5.1

### Patch Changes

- d46b740: Fix missed build and test errors.
- Updated dependencies [d46b740]
  - @reqlan/analytical@0.8.1
  - @reqlan/language@1.8.1

## 0.5.0

### Minor Changes

- 93368c6: Update exports; add support for wildcard import; update search functionality; add barrel import

### Patch Changes

- Updated dependencies [93368c6]
  - @reqlan/analytical@0.8.0
  - @reqlan/language@1.8.0

## 0.4.0

### Minor Changes

- f7023c1: various changes and improvements.

### Patch Changes

- Updated dependencies [f7023c1]
  - @reqlan/analytical@0.7.0
  - @reqlan/language@1.7.0

## 0.3.3

### Patch Changes

- Updated dependencies [674da15]
  - @reqlan/analytical@0.6.3

## 0.3.2

### Patch Changes

- Updated dependencies [eb9da11]
  - @reqlan/language@1.6.2
  - @reqlan/analytical@0.6.2

## 0.3.1

### Patch Changes

- 0a5649e: update the site base path, and untrack build artifacts
- Updated dependencies [0a5649e]
  - @reqlan/analytical@0.6.1
  - @reqlan/language@1.6.1

## 0.3.0

### Minor Changes

- 54a2536: introduce bases, refine config, improvements to summary, site improvements.

### Patch Changes

- Updated dependencies [54a2536]
  - @reqlan/analytical@0.6.0
  - @reqlan/language@1.6.0

## 0.2.4

### Patch Changes

- 3e940a2: cicd trigger.
- Updated dependencies [3e940a2]
  - @reqlan/analytical@0.5.4
  - @reqlan/language@1.5.3

## 0.2.3

### Patch Changes

- 9586a97: package publish trigger
- Updated dependencies [9586a97]
  - @reqlan/analytical@0.5.3
  - @reqlan/language@1.5.2

## 0.2.2

### Patch Changes

- b905cd0: update npm deployement.
- Updated dependencies [b905cd0]
  - @reqlan/analytical@0.5.2
  - @reqlan/language@1.5.1

## 0.2.1

### Patch Changes

- Updated dependencies [4f86d2b]
  - @reqlan/analytical@0.5.1

## 0.2.0

### Minor Changes

- 627d502: updates to cli, site export, site (showing spec), replace welcome screen, temp remove old extension name.

### Patch Changes

- Updated dependencies [627d502]
  - @reqlan/analytical@0.5.0
  - @reqlan/language@1.5.0

## 0.1.1

### Patch Changes

- 1790ce1: Update the landers.
- Updated dependencies [1790ce1]
  - @reqlan/language@1.4.1
  - @reqlan/analytical@0.4.1

## 0.1.0

### Minor Changes

- 8ac3f82: Minor site showcase fixes, extension search functinoality, cli init.

### Patch Changes

- Updated dependencies [8ac3f82]
  - @reqlan/analytical@0.4.0
  - @reqlan/language@1.4.0
