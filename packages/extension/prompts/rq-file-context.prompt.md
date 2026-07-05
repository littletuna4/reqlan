---
name: rq-file-context
description: Summarise requirements in, referencing, or linked to the active or named file.
argument-hint: "[optional file path]"
agent: ask
---

# File requirement context

Summarise requirements related to this file:

${input:filePath:Leave empty for the active file, or provide a path}

Include:

- requirements defined in the file
- requirements that reference it
- comment-linked requirements

Keep the response compact and cite paths.
