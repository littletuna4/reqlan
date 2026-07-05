---
name: rq-build-requirement
description: Create a new reqlan requirement from user or AI-provided intent.
argument-hint: "[intent or feature description]"
agent: agent
tools: ['edit', 'search']
---

# Build requirement

Create a new reqlan requirement from the user's intent.

## Steps

1. Clarify the intent if it is ambiguous.
2. Search existing requirements to avoid duplicates (`search_requirements` MCP tool or `@reqlan /rq-search`).
3. Choose the most specific existing `.rq` file, or propose a new file path if none fits.
4. Draft a requirement block with:
   - a concise name
   - a summary line
   - relevant attributes (`@status`, `@tags`, `@plan` when appropriate)
   - links to related requirements already in the graph
5. Show the draft before editing unless the user asked you to apply it directly.

Keep the requirement small, testable, and aligned with surrounding reqlan style in the target file.

User intent:

${input:intent:Describe the requirement to create}
