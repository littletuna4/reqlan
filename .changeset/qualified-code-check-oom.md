# Changeset: OOM Fix for reqlan check

## Problem

The `reqlan check` command was crashing with an OOM error (SIGKILL) when processing `.ts`/`.tsx` symbol targets that were incorrectly treated as Reqlan requirements. This was caused by:

1. Parser infinite loop in `parse_list_items` that kept adding empty list items without advancing
2. Check engine parsing non-.rq files as requirements before validation

## Solution

### 1. Parser Budget Control (crates/reqlan-parse/src/parser.rs)
- Added `check_budget()` call in `parse_list_items` loop to prevent infinite loops
- Improved `parse_list_item` to ensure progress is made with each item
- Added guard to stop parsing at attribute boundaries and enclosing block close

### 2. Qualified Target Filtering (crates/reqlan-index/src/check/qualified.rs)
- Added `is_rq_uri()` guard before validating qualified targets
- Ensured only `.rq` files are processed as qualified targets
- Added early return for non-.rq targets in `file_declares_idea`

### 3. Early Rejection of Non-.rq Targets (crates/reqlan-index/src/check/index.rs)
- Added `if !is_rq_uri(file_uri) { return false; }` guard in `file_declares_idea`
- Prevents parsing of non-.rq files as requirements

### 4. Check Implementation Update (crates/reqlan-rq/core_analysis/check_oom.rq)
- Renamed from `check_oom` to `check_single_index_snapshot` to reflect the new bounded snapshot approach

### 4. Test Addition (crates/reqlan-index/tests/broken_references.rs)
- Added test `check_accepts_code_symbol_targets_without_parsing_them_as_requirements`
- Verifies that code-symbol targets are not parsed as requirements

## Verification

- `pnpm val` passes without errors
- `reqlan check` completes successfully in ~0.97s (previously OOM)
- `reqlan check` in process-twin completes without crashes
- All existing tests pass

## Files Modified

- crates/reqlan-parse/src/parser.rs
- crates/reqlan-index/src/check/qualified.rs
- crates/reqlan-index/src/check/index.rs
- crates/reqlan-rq/core_analysis/check_oom.rq
- crates/reqlan-index/tests/broken_references.rs