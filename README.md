<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/site/public/logo.svg" alt="reqlan logo" width="128" height="128">
</p>

# reqlan

Semantic requirements as code.

reqlan is a small text language for writing software requirements as a graph of named ideas that link to each other and to your code. It is for developers and teams who want requirements to live in the repo, next to the code, under version control, and in a form that both people and AI assistants can navigate.

## Why use it

- **Requirements in plain text.** `.rq` files diff, review, and merge like any other source file.
- **Linked, not flat.** Ideas reference other ideas and files, so you can trace what depends on what.
- **Checked like code.** The CLI reports broken idea, import, comment, and file references, so it can run in CI.
- **Code points back.** Source comments in any language can link to an idea with `rq:[...]`.
- **Built for AI context.** The VS Code extension, CLI `click` and `search` commands, and an MCP server give an assistant compact, relevant requirement context.

## Quick start

### 1. Install a tool

| Tool | Install |
| --- | --- |
| VS Code extension | [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension) or [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension) |
| CLI (`reqlan` / `rq`) | `npm install -g @reqlan/cli` (Node 20.10 or later) |
| MCP server | `npx @reqlan/mcp` (setup in [`packages/mcp`](./packages/mcp/README.md)) |

The CLI and MCP server need a native package for your platform, installed as an optional dependency. If it is missing, see "Native engine (pnpm)" in the [CLI README](./packages/cli/README.md).

### 2. Write your first ideas

Create `main.rq`. This is a cut-down version of [`example_rq_project/main.rq`](./example_rq_project/main.rq):

```rq
// curly braces are rich container
myidea {
    It should be a good thing.
}

my_unbracketed_one_liner_idea ideas should support one liners

"my idea2" {
    it should be compatible with [[myidea]].

    @status: pending
    @tags (
        todo
        highpriority
    )
}

// () round brackets indicate a list
my_ideaset (
    myidea,
    "my idea2"
)
```

### 3. Run the CLI

```bash
reqlan init          # mark the current folder as a reqlan base (creates .reqlan/)
reqlan parse main.rq # parse one file and print diagnostics
reqlan check         # check that idea, import, comment, and file references resolve
reqlan search "good thing"
reqlan export        # write the graph as a static HTML site (default: ./reqlan-export)
```

To try it on a larger sample, open the [`example_rq_project`](./example_rq_project) folder in VS Code with the extension installed.

## Concept tour

| Concept | What it is | Syntax |
| --- | --- | --- |
| Idea | A named requirement. The body describes the desired outcome. | `name text` or `name { ... }`; use quotes for names with spaces: `"my idea2" { ... }` |
| Attribute | Optional metadata on an idea. Any name is allowed. | `@status: pending`, `@tags ( ... )`, `@plan { ... }`, `@references ( ... )`, `@flag`, `@flag!` (false) |
| Ideaset | A named list of ideas that acts as a namespace. Each file is also an implicit ideaset. | `my_ideaset ( myidea, "my idea2" )` |
| Reference | A link to an idea, attribute, ideaset, or file. | `[[myidea]]`, `[[myidea\|label]]`, `["./apythonfile.py"]` |
| Import | Bring ideas from another `.rq` file into scope. | `from "main.rq" import myidea`, `import "./exampleimport.rq"`, `import "exampleimport2.rq" as alias` |
| Code comment link | A comment in any source file that points to an idea. | `# rq:["./file.rq".idea_name]` |
| Comments | Meta comments inside `.rq` files. | `// line` and `/* block */` |

More examples:

- [`example_rq_project/`](./example_rq_project) shows imports, cross-file references, and references from ideas to a Python file.
- [`example_rq_project/enumeratedfeatures.md`](./example_rq_project/enumeratedfeatures.md) lists the language features and where each one is demonstrated.
- [`spec.md`](./spec.md) is the original language spec.
- [`reqlan rq/`](./reqlan%20rq) is this project's own requirements, written in reqlan.

## Repository layout

| Path | Contents |
| --- | --- |
| [`packages/language`](./packages/language) | Langium grammar and language services (`@reqlan/language`) |
| [`packages/analytical`](./packages/analytical) | Indexing, search, and export library used by the extension, CLI, and MCP (`@reqlan/analytical`) |
| [`packages/analytical-native`](./packages/analytical-native) | Per-platform native binary packages |
| [`packages/extension`](./packages/extension) | VS Code extension |
| [`packages/cli`](./packages/cli) | Command-line interface (`@reqlan/cli`) |
| [`packages/mcp`](./packages/mcp) | MCP server for requirement graph tools (`@reqlan/mcp`) |
| [`crates`](./crates) | Rust workspace: parser, index, search, export, language server, and Node bindings |
| [`site`](./site) | Next.js static site |
| [`presentations`](./presentations) | Tutorial slide decks (Reveal.js) |
| [`example_rq_project`](./example_rq_project) | Small sample project |
| [`reqlan rq`](./reqlan%20rq) | The project's own requirement graph |
| [`testdata/golden-corpus`](./testdata/golden-corpus) | Frozen `.rq` fixtures for parser tests |

## Documentation

- [Site](https://reqlan.com)
- [CLI reference](./packages/cli/README.md): all commands, options, and native install troubleshooting
- [MCP server](./packages/mcp/README.md): tools and Cursor setup
- [VS Code extension](./packages/extension/README.md)
- [Language package](./packages/language/README.md)
- [Developer notes](./README.dev.md)

## Contributing

The workspace uses pnpm 12.10.1, Node 20.10 or later, and a stable Rust toolchain.

```bash
pnpm install --frozen-lockfile
node scripts/ensure-host-native.mjs   # make sure the native package for your platform is present
pnpm run build                        # build everything
pnpm test                             # JS/TS tests and Rust crate tests
pnpm run check                        # check requirement references in this repo
```

- CI runs Rust fmt and clippy, crate tests, `reqlan check`, and the package tests on every pull request ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).
- Add a changeset for user-facing changes with `pnpm changeset`.
- Non-trivial requirements are recorded as `.rq` files in [`reqlan rq/`](./reqlan%20rq), and code links back to them with `rq:` comments. See [`AGENTS.md`](./AGENTS.md) for the project conventions.
- Questions and ideas: [Discord](https://discord.gg/R487KDVfmA) or [reqlan@reqlan.com](mailto:reqlan@reqlan.com).

## Support

- [Sponsor](https://github.com/sponsors/littletuna4)

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0-only).
