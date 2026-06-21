# Enumerated Reqlan features

Features from [spec.md](../spec.md), with examples noted where demonstrated in this project.

## Language semantics

What the constructs mean — the requirement graph model, not how it is written.

### Core units

- **idea** — core unit: a named requirement with an outcome (description) and optional metadata
- **ideaset** — namespace container for ideas, references to ideas, and nested ideasets; name may default to the filename
- **file** — a document composed of imports plus a colloection of ideas. A file is an implicit ideaset

### Idea attributes

- an attribute can have any name
- aside from the body, they're annotated with @ prefix. They are not required, and there should be some config for the finer detials.

- **description** — the desired outcome; inline in the idea body
- **@plan** — how to achieve the outcome — `main.rq`
- **@status** — lifecycle state — `main.rq`
- **@priority**
- **@criticality** — must have / should have / could have / won't have
- **@confirmation**
- **@owner**
- **@log**
- **@tags** — concept or simple metadata — `main.rq`, `sub idea.rq`
- default tag vocabulary: concept, definition, tenet, assertion, philosophy, speculation, nice-to-have, deprecated, stub
- **@references** — explicit declaration of links to other ideas or files — `main.rq`, `sub idea.rq`
- arbitrary custom `@attribute` fields

### References

- references may target ideas, idea attributes, ideasets, or files
- references may be embedded in description, plan, or other fields — `main.rq`, `sub idea.rq`
- references may be declared explicitly in `@references` or implied by mention elsewhere
- **reference kinds**: dependency, incompatible with, applies to, related to (spec; not shown in examples)
- wildcards and application to namespaces/ideasets (spec)
- **indirect references** — links inferred by traversing the requirement graph (spec)

### Imports

- import a specific idea from another file — `sub idea.rq`
- import an ideaset as a namespace — `sub idea.rq`
- import with alias for local name resolution — `sub idea.rq`
- qualified import of `{ideaset}.{idea}` from a path (spec)

## Language / syntax features

Concrete surface syntax for writing `.rq` files.

### File layout

- `.rq` file suffix
- front matter (syntax TBD in spec)
- file body: imports, then ideaset content

### Ideas and ideasets

- unquoted idea names (`myidea`)
- quoted idea names for identifiers containing spaces (`"my idea2"`) — `main.rq`
- idea body in curly braces `{ ... }` — `main.rq`
- ideaset as parenthesized list `( idea1, idea2 )` — `main.rq`

### References

- single-bracket forms: `[ideaset]`, `[idea]`, `[ideaset.idea]`, `[idea.attribute]`
- double-bracket wikilink: `[[idea]]` — `main.rq`, `sub idea.rq`
- obsidian-style alias pipe: `[[idea|display label]]` — `main.rq`
- cross-file qualified form: `[[path.rq.idea]]` — `sub idea.rq`
- `@references` as block `{ }` — `main.rq`
- `@references` as list `( ... )` — `sub idea.rq`

### Imports

- `from "{path}" import {idea}` — `sub idea.rq`
- `import "{path}"` — `sub idea.rq`
- `import "{path}" as alias` — `sub idea.rq`
- `import "{path}".{ideaset}.{idea}` (spec)
- `import "{path}".{ideaset}.{idea} as alias` (spec)
- `from "{path}" import {idea} as alias` (spec)
- relative paths (`./exampleimport.rq`) — `sub idea.rq`

### Comments and literals

- line comments with `//` — `main.rq`, `sub idea.rq`
- block comments with `/* */` — `main.rq`
- multiline block comments (spec)
- inline meta-comment after content on the same line — `main.rq`
- code snippets in triple backticks (spec; not shown in examples)

### Lists and flags

- parenthesized lists `( item, item )` for `@tags`, `@plan` steps, `@references` — `main.rq`, `sub idea.rq`
- bare `@flag` for true boolean/render keyword — `main.rq`
- `@flag!` suffix for false boolean/render keyword — `main.rq`

## IDE features

Editor and LSP behavior; not part of the language text itself.

- hover summary for idea, namespace, or attribute
- go-to-definition and trace dependency/reference graph
- autoformatting
- validate imports and references; report broken or missing files (spec)
- warn on unused imports (noted in `sub idea.rq`)
- tag autofill ordered by proximity to matching tags
- toggle for showing indirect references
- project config via `.reqlan`

## Example project coverage

| File | Demonstrates |
|------|----------------|
| `main.rq` | ideas, quoted names, wikilinks, aliases, `@plan`, `@status`, `@tags`, `@references`, flags, ideaset |
| `sub idea.rq` | imports, cross-file references, `@references` list |
| `exampleimport1.rq` | importable idea in another file |
| `exampleimport2.rq` | empty file (placeholder for namespace import target) |
