---
name: rq-requirements
description: >-
  Work with reqlan (.rq) requirement graphs: search ideas, inspect file context,
  trace references, and keep AI context focused. Use when editing .rq files,
  discussing requirements, tracing dependencies, or asking about project intent.
---

# reqlan Requirements

Use the requirement graph — not source guesses alone.

## Ontology (this repo as example)

| Concept            | Meaning                                      | Example                            |
| ------------------ | -------------------------------------------- | ---------------------------------- |
| **idea**           | Named unit of intent                         | `cli_package`, `skills`            |
| **file / ideaset** | Container (file ⇒ implicit ideaset)          | `reqlan rq/cli/cli_package.rq`     |
| **base**           | `.reqlan` boundary + ideas index             | workspace root with `.reqlan/`     |
| **reference**      | Link to idea or file                         | `[cli_package]`, `["./path".idea]` |
| **attribute**      | `@name` metadata; first unmarked text = body | `@status done`                     |

## Special attributes (required when writing)

- `@status` — lifecycle (`draft` \| `pending` \| `in-progress` \| `done` \| …)
- `@todo` — open gaps / follow-ups
- `@tests` — quoted test paths proving the idea (`path` or `path:test name`)

Do not bury these in body prose.

## CLI (`reqlan` / `rq`)

Same analytical index as extension/MCP (`<base>/.reqlan`).

`init` · `parse <file>` · `analyse`/`analyze` · `search <query>` · `export`/`export html`

`--json` · `--cwd` / `REQLAN_WORKSPACE` · `REQLAN_INDEX_PATH`

## Workflow

1. Prefer focused queries over full-graph dumps.
2. Start from the active `.rq` file or a named idea.
3. Expand only when asked.

## Surfaces

- Skills: `/rq-requirements`, `/rq-search`, `/rq-fix-stale-references`, `/rq-build-requirement`, …
- MCP: `search_requirements`, `file_context`, `local_graph`, `requirement_reference`, `file_reference`
- `@reqlan` chat: `/rq-search`, `/rq-context`, `/rq-graph`, `/rq-related`
- Palette: Semantic Search, File Related Requirements, Ideas Summary
- LM tools: `#requirement`, `#file`

## Token discipline

Compact: name, path, status, one-line summary, key refs. Limit ~5–8 matches. Full graph only on explicit request.

## Writing

Clear name + body. Always `@status` / `@todo` / `@tests` when applicable. Link related ideas. Prefer the most specific existing `.rq` file.

See [search skill](../rq-search/SKILL.md).
