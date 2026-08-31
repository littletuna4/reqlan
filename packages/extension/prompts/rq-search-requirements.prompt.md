---
name: rq-search-requirements
description: Search reqlan requirements by keyword across names, summaries, tags, and references.
argument-hint: "[search query]"
agent: ask
---

# Search requirements

Search the workspace requirement graph for:

${input:query:Search text}

Return compact matches only. Prefer MCP `click` or `@reqlan /rq-search` over loading the full index. Pass `sessionKey` on later clicks.
