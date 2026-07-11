import extensionPackage from "../../../packages/extension/package.json";
import { getPhonebookLink } from "@/lib/phonebook";

export type QuickstartIdeId = "cursor" | "vscode" | "openvsx" | "vsix";

export type QuickstartIconRef = {
  set: "simple-icons" | "mdi";
  name: string;
};

export type QuickstartIde = {
  id: QuickstartIdeId;
  label: string;
  tagline: string;
  recommended?: boolean;
  icon: QuickstartIconRef;
  primaryAction: {
    label: string;
    href: string;
    external?: boolean;
  };
  deepLink?: string;
  cli?: string;
  steps: string[];
  tips?: string[];
};

const extensionId = `${extensionPackage.publisher}.${extensionPackage.name}`;
const extensionVersion = extensionPackage.version;

const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");

export const quickstartContent = {
  title: "Get started",
  intro:
    "Install the reqlan extension, open a workspace with `.rq` files, and start tracing requirements in your editor.",
  defaultIde: "cursor" satisfies QuickstartIdeId,
  extension: {
    id: extensionId,
    version: extensionVersion,
    displayName: extensionPackage.displayName,
  },
  vsixDownloadUrl: `https://open-vsx.org/api/reqlan/reqlan/${extensionVersion}/file/reqlan.reqlan-${extensionVersion}.vsix`,
  ides: [
    {
      id: "cursor",
      label: "Cursor",
      tagline: "Recommended — full AI workflow with rq-* skills and MCP.",
      recommended: true,
      icon: { set: "mdi", name: "cursor-default-click" },
      primaryAction: {
        label: "Open Cursor Extensions",
        href: "cursor:extension/reqlan.reqlan",
      },
      deepLink: "cursor:extension/reqlan.reqlan",
      cli: "cursor --install-extension reqlan.reqlan",
      steps: [
        "Open the Extensions view (Ctrl+Shift+X / Cmd+Shift+X).",
        'Search for "reqlan" and install reqlan support.',
        "Reload the window if prompted.",
        'Run Reqlan: Install Cursor Skills from the command palette to sync rq-* skills and MCP config.',
      ],
      tips: [
        "Cursor installs from the same extension catalog as VS Code — if the deep link does not open, use the marketplace install below.",
        "After installing skills, reload Cursor so chat picks up the new rq-* commands.",
      ],
    },
    {
      id: "vscode",
      label: "VS Code",
      tagline: "Visual Studio Code with the official marketplace listing.",
      icon: { set: "simple-icons", name: "visualstudiocode" },
      primaryAction: {
        label: "Install from Marketplace",
        href: vsc.href,
        external: true,
      },
      deepLink: `vscode:extension/${extensionId}`,
      cli: "code --install-extension reqlan.reqlan",
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
      tagline: "VSCodium, Gitpod, Eclipse Theia, and other Open VSX–based editors.",
      icon: { set: "simple-icons", name: "vscodium" },
      primaryAction: {
        label: "View on Open VSX",
        href: openvsx.href,
        external: true,
      },
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
      tagline: "Manual install when marketplace access is restricted or offline.",
      icon: { set: "mdi", name: "package-down" },
      primaryAction: {
        label: `Download v${extensionVersion} VSIX`,
        href: `https://open-vsx.org/api/reqlan/reqlan/${extensionVersion}/file/reqlan.reqlan-${extensionVersion}.vsix`,
        external: true,
      },
      steps: [
        "Download the `.vsix` file using the button above.",
        "Open Extensions, choose the ··· menu, then Install from VSIX…",
        "Select the downloaded file and reload when prompted.",
        "The same VSIX is published to both the Visual Studio Marketplace and Open VSX.",
      ],
    },
  ] satisfies QuickstartIde[],
  nextSteps: [
    "Create or open a `.rq` file in your workspace.",
    "Use @reqlan in Copilot chat or rq-* skills in Cursor for requirement-aware AI.",
    "Open the reqlan activity bar for graph views, idea tables, and exports.",
  ],
} as const;

export type QuickstartContent = typeof quickstartContent;
