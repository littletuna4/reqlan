---
"@reqlan/analytical": patch
---

Fix duplicate `reqlan check` file-reference rows: the index extractor re-scanned each `.rq` file and filed every bracketed quoted path onto the first idea in that file, so each missing file target was reported twice — once from the owning idea and once as a phantom edge on an unrelated idea. The extractor now indexes a file reference only from the idea whose body contains it (parts walk), removing the whole-file scan and its unreachable `file#__file__` sentinel. Inbound referencers, graph exports, and coverage metrics no longer see the phantom edges.
