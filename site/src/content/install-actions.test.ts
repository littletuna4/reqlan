import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveQuickstartIcon } from "../lib/quickstart-icons.js";
import { getPhonebookPackage } from "../lib/phonebook.js";
import {
  cliInstallCommands,
  defaultCliPackageManager,
  getCliInstallCommand,
  getMcpInstallCommand,
  heroInstallActions,
  installActions,
} from "./install-actions.js";
import { quickstartContent } from "./quickstart.js";

describe("hero extension install", () => {
  // rq:["../../../reqlan rq/site/site.rq".cta_icon]

  it("omits Open VSX from the hero extension menu", () => {
    assert.deepEqual(
      heroInstallActions.map((action) => action.id),
      ["cursor", "vscode", "vsix"],
    );
  });

  it("keeps Open VSX on the full install list for quickstart", () => {
    assert.deepEqual(
      installActions.map((action) => action.id),
      ["cursor", "vscode", "openvsx", "vsix"],
    );
    assert.ok(quickstartContent.ides.some((ide) => ide.id === "openvsx"));
  });
});

describe("CLI install commands", () => {
  // rq:["../../../reqlan rq/site/site.rq".install_cli_menu]
  // rq:["../../../reqlan rq/phonebook.rq".npm_packages]

  it("defaults to npm and lists more package managers", () => {
    const pkg = getPhonebookPackage("cli").label;
    assert.equal(defaultCliPackageManager, "npm");
    assert.deepEqual(
      cliInstallCommands.map((item) => item.id),
      ["npm", "pnpm", "yarn", "bun"],
    );
    assert.equal(cliInstallCommands[0]?.id, defaultCliPackageManager);
    assert.equal(
      getCliInstallCommand("npm").command,
      `npm install -g ${pkg}`,
    );
    assert.equal(getCliInstallCommand("pnpm").command, `pnpm add -g ${pkg}`);
    assert.equal(
      getCliInstallCommand("yarn").command,
      `yarn global add ${pkg}`,
    );
    assert.equal(getCliInstallCommand("bun").command, `bun add -g ${pkg}`);
  });

  it("resolves an icon for each CLI package manager", () => {
    for (const command of cliInstallCommands) {
      assert.ok(
        resolveQuickstartIcon(command.icon),
        `missing icon for ${command.id}`,
      );
    }
  });

  it("reuses the same commands on the quickstart CLI package", () => {
    const cli = quickstartContent.packages.find((pkg) => pkg.id === "cli");
    assert.equal(cli?.install, getCliInstallCommand("npm").command);
    assert.deepEqual(
      cli?.installCommands?.map((item) => item.id),
      ["npm", "pnpm", "yarn", "bun"],
    );
  });

  it("offers npm, pnpm, yarn, and bun commands for the phonebook MCP package", () => {
    const pkg = getPhonebookPackage("mcp").label;
    const mcp = quickstartContent.packages.find((item) => item.id === "mcp");
    assert.equal(getMcpInstallCommand("npm").command, `npx -y ${pkg}`);
    assert.equal(getMcpInstallCommand("pnpm").command, `pnpm dlx ${pkg}`);
    assert.equal(getMcpInstallCommand("yarn").command, `yarn dlx ${pkg}`);
    assert.equal(getMcpInstallCommand("bun").command, `bunx ${pkg}`);
    assert.equal(mcp?.install, getMcpInstallCommand("npm").command);
    assert.deepEqual(
      mcp?.installCommands?.map((item) => item.id),
      ["npm", "pnpm", "yarn", "bun"],
    );
  });
});
