<p align="center">
  <img src="https://raw.githubusercontent.com/littletuna4/reqlan/HEAD/site/public/logo.svg" alt="reqlan logo" width="128" height="128">
</p>

# reqlan

Semantic requirements as code.

reqlan is a structured language for composing a graph of natural language ideas in software projects — with a VS Code extension, language server, and tooling for traceability and AI-assisted requirement work.

## Links

- [Site](https://reqlan.com)
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan-extension)
- [Open VSX](https://open-vsx.org/extension/reqlan/reqlan-extension)
- [GitHub repository](https://github.com/littletuna4/reqlan)
- [Discord](https://discord.gg/R487KDVfmA)
- [Sponsor](https://github.com/sponsors/littletuna4)
- [Contact](mailto:reqlan@reqlan.com)

## Repository

This monorepo contains the reqlan language, VS Code extension, static site, and supporting tools.

- [`packages/language`](./packages/language) — Langium grammar and language services
- [`packages/extension`](./packages/extension) — VS Code extension
- [`site`](./site) — marketing and documentation site
- [`packages/cli`](./packages/cli) — command-line interface
- [`packages/mcp`](./packages/mcp) — MCP server for requirement graph tools

See [README.dev.md](./README.dev.md) for workspace setup and development notes.
