---
name: rq-search
description: >-
  Search and retrieve reqlan requirements by keyword, file, or graph neighbourhood.
  Use when the user asks to find, locate, or summarize requirements in the workspace.
argument-hint: "[keyword or requirement name]"
disable-model-invocation: true
---

# Reqlan Search

Find requirements efficiently without loading the entire graph.

## Search order

1. If the user names a file, scope to that file first.
2. If they name a requirement, resolve it directly.
3. Otherwise run semantic search across names, summaries, tags, and references.

## Preferred tools

| Goal | Tool / command |
| --- | --- |
| Keyword search | MCP `search_requirements` or `/rq-search-requirements` or `@reqlan /rq-search` |
| Active file context | MCP `file_context` or `/rq-file-context` or `@reqlan /rq-context` |
| Local neighbourhood | MCP `local_graph` or `@reqlan /rq-graph` |
| Attach compact context | MCP `requirement_reference` / `file_reference` or `#requirement` / `#file` (VS Code) |

## Response format

For each match include:

- **Name**
- **Path** (relative)
- **Status / main attribute** when present
- **One-line summary**
- **Why it matched** (only when non-obvious)

Limit to the smallest set that answers the question. Offer to expand if the user needs more.
