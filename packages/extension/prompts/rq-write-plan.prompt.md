---
name: rq-write-plan
description: Draft or update an @plan attribute for a selected reqlan idea.
argument-hint: "[requirement name]"
agent: agent
tools: ['edit', 'search']
---

# Write plan

Draft or update the `@plan` attribute for a requirement.

## Steps

1. Resolve the target requirement by name or from the active `.rq` file.
2. Gather related requirements and dependencies with focused search — do not dump the full graph.
3. Propose a concise `@plan` attribute covering:
   - goal
   - constraints from related requirements
   - implementation steps
   - open questions
4. Show the proposed `@plan` text before editing the file unless the user asked you to apply it.

Target requirement:

${input:requirement:Requirement to plan for}
