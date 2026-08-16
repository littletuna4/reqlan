# Parser golden corpus

Frozen `.rq` fixtures for Langium ↔ Rust parse/extract alignment.

These files are **not** the product requirements graph (`reqlan rq/`). Production ideas may be added, renamed, or rewritten without updating this tree.

Refresh a fixture only when a grammar or extractor change needs a new representative document. Then regenerate `crates/reqlan-index/tests/golden/langium-corpus-names.json`:

```bash
UPDATE_GOLDEN=1 pnpm --filter @reqlan/language test test/langium-corpus-golden.test.ts
```
