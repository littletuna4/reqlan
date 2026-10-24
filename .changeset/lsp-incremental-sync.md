---
"reqlan-extension": patch
---

The language server applies each edit as a range instead of replacing the whole file on every keystroke. Open and close still send the full buffer, and the server reparses that buffer after the edits.
