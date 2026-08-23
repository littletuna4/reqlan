// rq:["../../../reqlan rq/site/site.rq".cta_icon]
// rq:["../../../reqlan rq/site/site.rq".install_cli_menu]
import extensionPackage from "../../../packages/extension/package.json";
import { getPhonebookLink, getPhonebookPackage } from "@/lib/phonebook";

export type QuickstartIdeId = "cursor" | "vscode" | "openvsx" | "vsix";

export type QuickstartIconRef = {
  set: "simple-icons" | "mdi";
  name: string;
};

export type InstallActionKind = "deeplink" | "external" | "download";

export type InstallAction = {
  id: QuickstartIdeId;
  label: string;
  shortLabel: string;
  icon: QuickstartIconRef;
  kind: InstallActionKind;
  href: string;
  deepLink?: string;
  cli?: string;
  tagline: string;
  steps: string[];
  tips?: string[];
};

const extensionId = `${extensionPackage.publisher}.${extensionPackage.name}`;
const extensionVersion = extensionPackage.version;

const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");

export const extensionMeta = {
  id: extensionId,
  version: extensionVersion,
  displayName: extensionPackage.displayName,
} as const;

export const vsixDownloadUrl = `https://open-vsx.org/api/reqlan/${extensionPackage.name}/${extensionVersion}/file/${extensionId}-${extensionVersion}.vsix`;

export type CliPackageManagerId = "npm" | "pnpm" | "yarn" | "bun";

export type CliInstallCommand = {
  id: CliPackageManagerId;
  label: string;
  icon: QuickstartIconRef;
  command: string;
};

const cliPackageName = getPhonebookPackage("cli").label;

export const defaultCliPackageManager: CliPackageManagerId = "npm";

export const cliInstallCommands: CliInstallCommand[] = [
  {
    id: "npm",
    label: "npm",
    icon: { set: "simple-icons", name: "npm" },
    command: `npm install -g ${cliPackageName}`,
  },
  {
    id: "pnpm",
    label: "pnpm",
    icon: { set: "simple-icons", name: "pnpm" },
    command: `pnpm add -g ${cliPackageName}`,
  },
  {
    id: "yarn",
    label: "yarn",
    icon: { set: "simple-icons", name: "yarn" },
    command: `yarn global add ${cliPackageName}`,
  },
  {
    id: "bun",
    label: "bun",
    icon: { set: "simple-icons", name: "bun" },
    command: `bun add -g ${cliPackageName}`,
  },
];

export function getCliInstallCommand(
  id: CliPackageManagerId,
): CliInstallCommand {
  const command = cliInstallCommands.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Unknown CLI install command: ${id}`);
  }
  return command;
}

const mcpPackageName = getPhonebookPackage("mcp").label;

const mcpCommandByManager: Record<CliPackageManagerId, string> = {
  npm: `npx -y ${mcpPackageName}`,
  pnpm: `pnpm dlx ${mcpPackageName}`,
  yarn: `yarn dlx ${mcpPackageName}`,
  bun: `bunx ${mcpPackageName}`,
};

export const mcpInstallCommands: CliInstallCommand[] = cliInstallCommands.map(
  (item) => ({
    ...item,
    command: mcpCommandByManager[item.id],
  }),
);

export function getMcpInstallCommand(
  id: CliPackageManagerId,
): CliInstallCommand {
  const command = mcpInstallCommands.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Unknown MCP install command: ${id}`);
  }
  return command;
}

export const installActions: InstallAction[] = [
  {
    id: "cursor",
    label: "Cursor",
    shortLabel: "Cursor",
    tagline: "rq-* skills and MCP sync for Cursor chat.",
    icon: { set: "mdi", name: "cursor-default-click" },
    kind: "deeplink",
    href: `cursor:extension/${extensionId}`,
    deepLink: `cursor:extension/${extensionId}`,
    cli: `cursor --install-extension ${extensionId}`,
    steps: [
      "Open the Extensions view (Ctrl+Shift+X / Cmd+Shift+X).",
      'Search for "reqlan" and install reqlan support.',
      "Reload the window if prompted.",
      "Run Reqlan: Install Cursor Skills from the command palette to sync rq-* skills and MCP config.",
    ],
    tips: [
      "Cursor installs from the same extension catalog as VS Code - if the deep link does not open, use the marketplace install below.",
      "After installing skills, reload Cursor so chat picks up the new rq-* commands.",
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    shortLabel: "VS Code",
    tagline: "Visual Studio Code with the official marketplace listing.",
    icon: { set: "simple-icons", name: "visualstudiocode" },
    kind: "external",
    href: vsc.href,
    deepLink: `vscode:extension/${extensionId}`,
    cli: `code --install-extension ${extensionId}`,
    steps: [
      "Open the Extensions view (Ctrl+Shift+X / Cmd+Shift+X).",
      'Search for "reqlan" and install reqlan support.',
      "Open a folder that contains `.rq` requirement files.",
      "Try Reqlan: List All Ideas or hover an idea link for navigation.",
    ],
  },
  {
    id: "openvsx",
    label: "Open VSX",
    shortLabel: "Open VSX",
    tagline:
      "VSCodium, Gitpod, Eclipse Theia, and other Open VSX–based editors.",
    icon: { set: "simple-icons", name: "vscodium" },
    kind: "external",
    href: openvsx.href,
    steps: [
      "Open your editor's Extensions view.",
      'Search the Open VSX registry for "reqlan".',
      "Install reqlan support and reload if needed.",
      "If your editor does not search Open VSX by default, download the VSIX tab instead.",
    ],
  },
  {
    id: "vsix",
    label: "Download VSIX",
    shortLabel: "VSIX",
    tagline: "Manual install when marketplace access is restricted or offline.",
    icon: { set: "mdi", name: "package-down" },
    kind: "download",
    href: vsixDownloadUrl,
    steps: [
      "Download the `.vsix` file using the button above.",
      "Open Extensions, choose the ··· menu, then Install from VSIX…",
      "Select the downloaded file and reload when prompted.",
      "The same VSIX is published to both the Visual Studio Marketplace and Open VSX.",
    ],
  },
];

export const defaultInstallIde: QuickstartIdeId = "vscode";

export const heroInstallActions = installActions.filter(
  (action) => action.id !== "openvsx",
);

export function getInstallAction(id: QuickstartIdeId): InstallAction {
  const action = installActions.find((item) => item.id === id);
  if (!action) {
    throw new Error(`Unknown install action: ${id}`);
  }
  return action;
}

export function getMarketplaceHref(): string {
  return vsc.href;
}
