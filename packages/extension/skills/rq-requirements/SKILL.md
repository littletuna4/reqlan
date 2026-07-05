---
name: rq-requirements
description: >-
  Work with reqlan (.rq) requirement graphs: search ideas, inspect file context,
  trace references, and keep AI context focused. Use when editing .rq files,
  discussing requirements, tracing dependencies, or asking about project intent.
---

# Reqlan Requirements

Use the reqlan requirement graph instead of guessing from source code alone.

## When to use

- The user mentions requirements, ideas, `.rq` files, or reqlan
- You need to know what a file is supposed to do according to documented intent
- You need upstream/downstream impact, references, or completion status
- You should avoid dumping the full workspace graph into context

## Core workflow

1. Prefer focused queries over full-graph dumps.
2. Start from the active `.rq` file or a named requirement.
3. Expand scope only when the user asks for broader analysis.

## Available surfaces

- **Cursor skills** (this repo): `/rq-requirements`, `/rq-search`, `/rq-build-requirement`, `/rq-search-requirements`, etc.
- **Cursor MCP** (`.cursor/mcp.json`): `search_requirements`, `file_context`, `local_graph`, `requirement_reference`, `file_reference`
- **@reqlan chat participant** (VS Code Copilot): `/rq-search`, `/rq-context`, `/rq-graph`, `/rq-related`
- **Command palette**: `Reqlan: Semantic Search`, `Reqlan: File Related Requirements`, `Reqlan: Open Ideas Summary`
- **Language model tools** (VS Code): `#requirement` and `#file` references in chat

## Token discipline

- Return compact summaries: name, path, status, short summary, key references
- Paginate or limit results (default 5–8 matches)
- Only export the full graph when the user explicitly requests it

## Writing requirements

When creating or updating requirements:

- Use reqlan block syntax with clear names and summaries
- Add attributes like `@status`, `@tags`, `@plan` when useful
- Link related ideas with wiki links or bracket references
- Place new requirements in the most specific existing `.rq` file unless the user directs otherwise

See [search skill](../rq-search/SKILL.md) for search-specific guidance.
