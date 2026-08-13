---
"@reqlan/cli": patch
"@reqlan/language": patch
"@reqlan/analytical": patch
---

Fix Windows CLI startup: dynamic import of `C:\...` is protocol `c:`; use `file://` URLs. Treat drive-letter paths as filesystem paths, not URI schemes.
