---
"reqlan-extension": patch
---

Fix the extension hanging on initialisation (activity bar stuck loading, commands never available).

- Stop building the Langium services at module-load time in the activity bar's git-context module; this heavy work ran during `require()` of the extension bundle, before `activate()`, and blocked the extension host. It is now created lazily on first use.
- Make activation non-blocking so the Context sidebar and commands become available immediately; start indexing and the language server in the background afterward.
- Isolate each activation/registration step so a failure in one subsystem can no longer abort activation or prevent the activity bar view from resolving.
