---
name: rq-search
description: >-
  Search and retrieve reqlan requirements by keyword, file, or graph neighbourhood.
  Use when the user asks to find, locate, or summarize requirements in the workspace.
argument-hint: "[keyword or requirement name]"
disable-model-invocation: true
---

# reqlan Search

Find requirements efficiently without loading the entire graph.

## Search order

1. If the user names a file, click that file.
2. If they name a requirement, click that name.
3. Otherwise click the search text. No exact match uses fuzzy search.

## Preferred tools

| Goal                   | Tool / command                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Search and retrieval   | MCP `click`. Pass `sessionKey` from the prior click. No exact match uses fuzzy text search, not embeddings. |
| Continue a session     | MCP `click` with the same `sessionKey`. A second click on the same centre returns connected content.     |
| VS Code chat           | `/rq-search-requirements` or `@reqlan /rq-search`. File neighbourhood: `/rq-file-context` or `@reqlan /rq-context`. |
| Attach compact context | MCP `click`, or `#requirement` / `#file` (VS Code)                                                      |

Do not call MCP `search_requirements`, `file_context`, `local_graph`, `summarize_subtree`, `requirement_reference`, `file_reference`, or `list_interactions`. Those tools are not on the MCP server.

## Response format

For each match include:

- **Name**
- **Path** (relative)
- **Status / main attribute** when present
- **One-line summary**
- **Why it matched** (only when non-obvious)

Limit to the smallest set that answers the question. Offer to expand if the user needs more. A later `click` with the same `sessionKey` expands connected content.
