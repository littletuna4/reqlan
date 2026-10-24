---
title: 'Align LSP and reqlan check for missing qualified .rq references'

---
packages/cli/src/commands/check.ts: add missing qualified .rq file to reqlan check's checks
packages/analytical/src/native/native-analysis-api.ts: add missing qualified .rq file to reqlan check's checks
packages/analytical/src/core.ts: add missing qualified .rq file to reqlan check's checks
crates/reqlan-index/src/broken.rs: fix CheckIndex migration compile errors
crates/reqlan-index/src/comment.rs: fix unresolved_comment_references type inference
crates/reqlan-index/src/lib.rs: export CheckIndex
crates/reqlan-index/tests/broken_references.rs: new test for missing qualified .rq file; helper list_refs
crates/reqlan-lsp/tests/parity.rs: new LSP parity test for missing qualified .rq file
reqlan rq/core_analysis/check.rq: add test links in check_qualified_missing_file and check_qualified_missing_idea
packages/language/src/reqlan-embedded-file-references.ts: add missing qualified .rq file to reqlan check's checks
---

This PR aligns the LSP and `reqlan check` for a missing qualified `.rq` reference (e.g., `["non-existant-file.rq".idea]`).

## What was broken

The LSP recognized a missing qualified `.rq` target as an unresolved idea:
```
Could not resolve reference to IdeaDeclaration named 'idea'.
```
but `reqlan check` did not flag the same construct. The logic was correct but lacked test coverage.

## What was fixed

### New tests
1. **`crates/reqlan-index/tests/broken_references.rs`** – `check_reports_qualified_reference_to_a_missing_rq_file`
   - Asserts that `check` reports a `file_reference` with label `non-existant-file.rq` and **does not** report a `references` row.

2. **`crates/reqlan-lsp/tests/parity.rs`** – `missing_qualified_rq_file_reports_unresolved_idea`
   - Asserts that the LSP emits the same unresolved‑idea diagnostic and that no import or file‑reference error appears.

### Build fixes (in‑flight refactor completed)
- `crates/reqlan-index/src/broken.rs`
  - Removed unused `store` parameters from `append_wildcard_sparse_rows` and `append_unresolved_import_rows`.
  - Fixed a `Vec<CheckEdge>` group to store a clone of the edge (type mismatch).
  - Fixed a move‑out‑of‑shared‑reference in the diagnostic push.
  - Removed a dead read of `indexed_rq` when the same data lives in `CheckIndex`.
  - Changed the internal call to `list_broken_references` to use the new `list_broken_references_from_index`.
  - Made `list_broken_references` a thin wrapper that builds the `CheckIndex`.
- `crates/reqlan-index/src/comment.rs`
  - Added explicit type annotation `unresolved_comment_references::<IdeaSummary>` for the test.
- `crates/reqlan-index/src/lib.rs`
  - Exported `CheckIndex` so that tests can construct it.
- `crates/reqlan-index/tests/broken_references.rs`
  - Added `list_refs` helper that calls the new public `list_broken_references`.
  - Updated all four existing `list_broken_references` call sites to use the helper.

### Requirement documentation updated
- `reqlan rq/core_analysis/check.rq`
  - Added `["../../crates/reqlan-index/tests/broken_references.rs:check_reports_qualified_reference_to_a_missing_rq_file"]` to `check_qualified_missing_file` `@tests`.
  - Added `["../../crates/reqlan-lsp/tests/parity.rs:missing_qualified_rq_file_reports_unresolved_idea"]` to `check_qualified_missing_idea` `@tests`.

### Specifics preserved
The behavior is unchanged for the existing `.ts` case (`check_reports_qualified_reference_to_a_missing_file`).
For a missing `.rq` target, the LSP still reports the idea‑unresolved diagnostic, and `check` reports a `file_reference` (kind) with the resolved path as label. A missing file never also raises a missing‑idea (`references`) error.

### Testing status
- `reqlan-index --test broken_references`: **43 passed**
- `reqlan-lsp --test parity`: **22 passed**

All index tests and LSP parity tests pass. The change is minimal, focused on completing the `CheckIndex` refactor and adding the missing coverage; no functional change to the qualified‑reference resolution logic.