---
name: rq-fix-stale-references
description: >-
  Find and repair unresolved reqlan idea, comment, file, and wildcard references.
  Use when the user asks to fix stale, broken, or missing references, after a
  rename or move, or when reqlan check reports issues.
argument-hint: "[optional path glob or file]"
---

# Fix stale references

Find unresolved reqlan references and repair them.

If the user named a path glob or file, pass it as `--glob`. If they did not, check the whole base.

## Steps

1. Get the issue list. Run `reqlan check --json` (or `rq check --json`). Add `--glob` when the user gave a path subset. MCP has no check tool. Do not use `analyse --broken-refs` unless `check` is unavailable (`analyse --broken-refs` omits comment refs unless you pass `--include-comments`). Exit status 1 means issues exist. That result is expected.
2. Group rows by `label` (the missing target). `check` already orders rows by target.
3. Choose one repair for each group. Apply that repair at every site in the group.
4. Run `reqlan check --json` again. Repeat until the scoped list is empty, or only intentional leftovers remain.
5. Report what you changed and what you left.

## JSON fields

- `fileUri` — source path (relative)
- `sourceName` — idea that holds the reference
- `kind` — `references` | `comment_link` | `file_reference` | `wildcard_reference`
- `label` — missing target text
- `sourceLine` — 0-based line
- `severity` — error (default) or `warning` (sparse wildcards)
- `matchCount` — wildcard match count (`0` or `1`)

## Repair rules

### `references` (idea brackets)

Search the graph for the missing name (MCP `click`, or CLI `reqlan search`).

- Renamed idea: replace `[old]` with `[new]` at every site.
- Moved idea: add `from "rel-path.rq" import name`, or rewrite to `["rel-path.rq".name]`. Match the import style already used in that file.
- Deleted idea: remove the reference, or point to a successor. Ask if more than one successor exists.
- Do not create a new idea only to satisfy a stale name unless the user asks.

### `comment_link`

Comment form is `rq:[idea]` or `rq:["path".idea]`. The path is relative to the file that holds the comment.

- Renamed idea: update the idea token.
- Moved idea: rewrite the qualified path.
- Deleted idea: remove that comment reference.

### `file_reference`

- Moved file: update the quoted path. Keep it relative to the referencing file.
- Deleted file: remove the reference, or point to a replacement.

### `wildcard_reference` (warning)

- 0 matches: correct the path glob or the idea pattern.
- 1 match: replace the wildcard with a concrete `["path".idea]`.
- A wildcard is for many ideas. Do not keep a 1-match wildcard.

## Limits

- Do not add `//rq-ignore-error` as the first repair. Use it only when the missing target is intentional. Put it on the line before the reference.
- Assume files have moved until proven otherwise - try to locate the source.
- Do not treat examples in `` `inline code` `` or fenced blocks as live refs. `check` already skips those.
- Do not load the full requirement graph.
- Do not rewrite unrelated references.

## Ask before you edit

Ask when several ideas could replace one missing name, when the repair would delete a large set of references, or when the user asked for a report only. Otherwise apply the repair.
