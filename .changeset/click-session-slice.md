---
"@reqlan/analytical": minor
"@reqlan/cli": minor
"@reqlan/mcp": minor
"@reqlan/language": patch
"@reqlan/extension": patch
---

Add click: local graph slice with SQLite session keys so CLI/MCP agents do not resurface the same ideas. Configurable `click.maxSessions` (default 100) evicts by last touch.
