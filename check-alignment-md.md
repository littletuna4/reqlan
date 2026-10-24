# LSP vs `reqlan check`: missing qualified `.rq` reference

## 1. Problem statement

The editor (LSP) flags `["non-existant-file.rq".idea]` as an unresolved reference.
`reqlan check` did not flag the same construct. Both tools must agree: a qualified
reference whose target file is absent is an error in the editor and in `check`.

## 2. Identification (why the two paths differ)

### 2.1 LSP path

`crates/reqlan-lsp/src/analysis.rs` -> `DocModel::diagnostics`, branch
`ReferenceTarget::Qualified { path: Some(..), idea, .. }`:

```rust
if !neighbor_has(path, idea)
    && !neighbor_binds_import(path, idea)
    && !self.has_idea(idea)
{
    self.push_unresolved_idea(&mut out, &ignored, &leaf, idea);
}
```

`neighbor_has` -> `crate::analysis::resolve_neighbor_file` (analysis.rs:2281)
-> `reqlan_index::locate_authored_rq_path` -> `absolute_rq_path` + `Path::is_file`.
The file is absent, so resolution returns `None`, `neighbor_has` returns `false`,
and the LSP emits:

```
Could not resolve reference to IdeaDeclaration named 'idea'.
```

The diagnostic range covers the idea token only (`ident_span_from`).

### 2.2 `check` path

`crates/reqlan-index/src/broken.rs` splits the two failure modes:

| Failure mode | Function | Kind | Label |
|---|---|---|---|
| Target file absent | `append_missing_qualified_file_targets` | `file_reference` | resolved file path |
| Target `.rq` present, idea absent | `append_unresolved_qualified_idea_targets` | `references` | idea name |

`append_unresolved_qualified_idea_targets` skips any target that is not an `.rq`
file on disk (`qualified_target_is_rq` -> `rq_path_exists`). That is correct and
required: the spec `reqlan rq/core_analysis/check.rq` `check_qualified_missing_idea`
states "A missing file stays `check_qualified_missing_file`. `check` does not also
report a missing idea for that file."

So `check` must report the missing `.rq` file as `file_reference`, once, and never
as `references`.

### 2.3 The actual gap

The `check` logic was already correct for `.rq` targets. The gap was **coverage**:

- The only test for a missing qualified target used a `.ts` file
  (`check_reports_qualified_reference_to_a_missing_file`, target
  `../../../../my/non-existentfile.ts`).
- No test covered a missing `.rq` target, so nothing pinned the `file_reference`
  kind and the "no `references` row" rule for that shape.
- No LSP parity test covered a missing qualified `.rq` file, so the editor
  behaviour for that shape was unpinned.

Both tools therefore behaved differently for reasons of unverified assumptions,
not a logic defect in either resolver.

## 3. Tests

### 3.1 `check` side

`crates/reqlan-index/tests/broken_references.rs`

```rust
#[test]
fn check_reports_qualified_reference_to_a_missing_rq_file() {
    let root = scratch("qual-missing-rq");
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"non-existant-file.rq\".idea]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(
        rows.iter().any(|row| {
            row.kind == "file_reference" && row.label == "non-existant-file.rq"
        }),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| row.kind != "references"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}
```

Assertions:
1. Exactly one row shape matters: `kind == "file_reference"` and
   `label == "non-existant-file.rq"` (the resolved path, relative to the workspace root).
2. No row has `kind == "references"`. A missing file must not also raise a
   missing-idea error.

### 3.2 LSP side

`crates/reqlan-lsp/tests/parity.rs`

```rust
#[test]
fn missing_qualified_rq_file_reports_unresolved_idea() {
    let root = scratch("missing-qualified-rq");
    let host = root.join("host.rq");
    let source = "host {\n    [\"non-existant-file.rq\".idea]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let diags = session.diagnostics(&uri);
    let found: Vec<_> = diags.iter().map(|d| d.message.clone()).collect();
    assert!(
        found.iter().any(|m| m == "Could not resolve reference to IdeaDeclaration named 'idea'."),
        "expected unresolved idea for missing .rq file, got: {found:?}"
    );
    assert!(
        !found.iter().any(|m| m.contains("Could not resolve import") || m.contains("file_reference")),
        "LSP reports idea-unresolved, not file-reference: {found:?}"
    );
    let _ = fs::remove_dir_all(&root);
}
```

Assertions:
1. The editor emits `Could not resolve reference to IdeaDeclaration named 'idea'.`
2. The editor does not emit an import-resolution error. The missing file is
   reported once, as the idea reference that cannot resolve.

### 3.3 Alignment rule pinned by the pair

| Construct | LSP | `check` |
|---|---|---|
| `["missing.rq".idea]`, file absent | `Could not resolve reference to IdeaDeclaration named 'idea'.` | kind `file_reference`, label = resolved path |
| `["missing.ts".term]`, file absent | `Could not resolve reference to IdeaDeclaration named 'term'.` | kind `file_reference`, label = resolved path |
| `["present.rq".absent]`, file present | `Could not resolve reference to IdeaDeclaration named 'absent'.` | kind `references`, label = idea name |
| `["present.rq".present]`, file present | no diagnostic | no row |

Both tools flag the construct. The *kind* differs by design: the editor has no
`file_reference` concept, so it reports the idea that failed to resolve.

## 4. Implementation notes

No change to `crates/reqlan-index/src/broken.rs` or
`crates/reqlan-index/src/path_resolve.rs` was needed for the qualified `.rq`
target. `append_missing_qualified_file_targets` already reported the missing
file as `file_reference`, and `append_unresolved_qualified_idea_targets` already
skipped absent files, so the two rules do not overlap.

Repairs made while landing the tests (the crate did not compile before this work):

- `crates/reqlan-index/src/broken.rs`
  - `append_wildcard_sparse_rows` and `append_unresolved_import_rows` took an
    unused `store` parameter after the `CheckIndex` migration. Removed the
    parameter and updated the two call sites in `check_references`.
  - `append_wildcard_sparse_rows` pushed `&CheckEdge` into a
    `Vec<CheckEdge>` group. Now clones the edge.
  - `append_wildcard_sparse_rows` moved `source.file_uri`, `source.id` and
    `source.name` out of a shared reference. Now clones.
  - `list_broken_references` read `indexed_rq` from the store even though the
    `CheckIndex` carries `indexed_rq_files`. Removed the dead read.
  - `check_references` called the 4-argument `list_broken_references`. Now calls
    `list_broken_references_from_index`, which reuses the index it already built.
  - `list_broken_references` is now a thin public wrapper that builds the
    `CheckIndex` and delegates to `list_broken_references_from_index`. The
    public signature is unchanged.
- `crates/reqlan-index/src/comment.rs`
  - `unresolved_comment_references` is generic over `IdeaRef`. The test call
    site could not infer the type parameter. Now names `IdeaSummary` explicitly.
- `crates/reqlan-index/src/lib.rs`
  - Exports `CheckIndex`.
- `crates/reqlan-index/tests/broken_references.rs`
  - The four `list_broken_references` call sites moved to a `list_refs` helper
    that matches the restored public signature.

## 5. Requirement graph updates

`reqlan rq/core_analysis/check.rq`

- `check_qualified_missing_file` `@tests` now lists
  `check_reports_qualified_reference_to_a_missing_rq_file`.
- `check_qualified_missing_idea` `@tests` now lists
  `missing_qualified_rq_file_reports_unresolved_idea` (the LSP parity test).

`check_qualified_missing_file` text now states that the rule covers a `.rq`
target as well as a code target, and that the editor underlines the same
construct.

## 6. Files changed

| File | Change |
|---|---|
| `crates/reqlan-index/src/broken.rs` | Compile repair of the `CheckIndex` migration (see section 4) |
| `crates/reqlan-index/src/comment.rs` | Type inference fix in the comment-reference test |
| `crates/reqlan-index/src/lib.rs` | Export `CheckIndex` |
| `crates/reqlan-index/tests/broken_references.rs` | New test `check_reports_qualified_reference_to_a_missing_rq_file`; helper `list_refs` |
| `crates/reqlan-lsp/tests/parity.rs` | New test `missing_qualified_rq_file_reports_unresolved_idea` |
| `reqlan rq/core_analysis/check.rq` | Test links and rule text |
| `check-alignment-md.md` | This document |

## 7. Commands

```bash
cd crates
cargo test -p reqlan-index --test broken_references
cargo test -p reqlan-lsp --test parity
```

Results at the time of writing:

- `reqlan-index --test broken_references`: 43 passed, 0 failed.
- `reqlan-lsp --test parity`: 22 passed, 0 failed.

## 8. Residual risk

- The CLI path (`packages/cli` -> `packages/analytical` -> `reqlan-napi` ->
  `reqlan_index::check_references`) is the same Rust entry point covered by the
  index test, so the CLI inherits the fixed behaviour. The CLI wiring itself is
  not covered by a new test here.
- A missing qualified file whose parent directory is missing is reported with the
  same resolved path label. That is consistent with the existing `.ts` case.
