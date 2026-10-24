---
"@reqlan/analytical": patch
"@reqlan/cli": patch
"reqlan-extension": patch
---

`reqlan check` accepts a code-symbol target and does not parse that target as a requirement file. The parser stops when a list makes no progress, so the check does not run out of memory.
