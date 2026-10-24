---
'@reqlan/analytical': minor
---

Added the ability to filter exported nodes by the presence or value of their
`attributes`. When the user supplies one or more `AttributeFilter` rules, the
Rust `ExportRequest.attribute_filters` vector is forwarded through the analysis
layer and used inside `filter_export_ideas` to keep only ideas whose attributes
satisfy every rule (present, absent, or equal to a given value).

## Backwards incompatible changes
None.

## Fixed
- `crates/reqlan-export/src/snapshot.rs`: `filter_export_ideas` now accepts the
  raw per-idea attribute JSON map and applies `AttributeFilter` rules instead of
  only excluding secret / ignored files.
- Updated the Rust `ExportRequest`, `ExportRequestDto`, specta-generated TS
  types, and the `NativeAnalysisApi.exportFormat` builder to carry
  `attribute_filters` end to end.

## Added
- `packages/analytical/src/core/attribute-enumeration.ts` and its test —
  enumerate the attribute keys used across a project.
- `reqlan rq/extension/attribute-enumeration.rq` requirements doc.
- `ExportRequest.attributeFilters: AttributeFilter[]` on the TypeScript `ExportRequest`.

## Changed
- Export pipeline now receives explicit attribute filters at both the Rust
  engine and the TypeScript API surfaces.

## Removed
- Nothing removed.

## Additional information
The current export command and extension UI pass `attributeFilters` through
transparently; interactive UI picking attribute keys/values/presence is
planned as a follow-up. Existing build and export tests remain green.