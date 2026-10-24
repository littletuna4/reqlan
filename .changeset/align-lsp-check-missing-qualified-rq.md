---
"@reqlan/analytical": patch
"@reqlan/cli": patch
"reqlan-extension": patch
---

`reqlan check` reports a qualified reference when the `.rq` file is missing. The language server reports that same target as an unresolved idea. A missing file does not also report a missing idea.
