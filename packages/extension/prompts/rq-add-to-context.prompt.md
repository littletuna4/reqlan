---
name: rq-add-to-context
description: Attach selected reqlan requirements to the current AI conversation as focused context.
argument-hint: "[requirement name or keyword]"
agent: ask
---

# Add requirements to context

Attach compact requirement context to this conversation.

## Steps

1. Resolve the named requirement(s) with `search_requirements` or `#requirement`.
2. For each match, include only:
   - name and file path
   - status / main attributes
   - summary
   - directly related references (not the full graph)
3. State what was attached and what was omitted to save tokens.

Requirement to attach:

${input:requirement:Requirement name or search text}
