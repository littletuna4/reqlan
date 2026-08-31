import {
  cliInstallCommands,
  defaultInstallIde,
  extensionMeta,
  getCliInstallCommand,
  getMcpInstallCommand,
  installActions,
  mcpInstallCommands,
  vsixDownloadUrl,
  type CliInstallCommand,
  type InstallAction,
  type QuickstartIconRef,
  type QuickstartIdeId,
} from "@/content/install-actions";
import type { PhonebookPackageId } from "@/lib/phonebook";

export type { InstallAction, QuickstartIconRef, QuickstartIdeId };

export type QuickstartNextStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

export type QuickstartIde = InstallAction & {
  primaryAction: {
    label: string;
    href: string;
    external?: boolean;
  };
};

function toQuickstartIde(action: InstallAction): QuickstartIde {
  const external = action.kind !== "deeplink";

  return {
    ...action,
    primaryAction: {
      label:
        action.kind === "download"
          ? `Download v${extensionMeta.version} VSIX`
          : action.kind === "deeplink"
            ? `Open ${action.label} Extensions`
            : action.id === "openvsx"
              ? "View on Open VSX"
              : "Install from Marketplace",
      href: action.href,
      external,
    },
  };
}

export type QuickstartRelatedLink = {
  id: string;
  href: string;
  label: string;
  detail: string;
};

export type QuickstartSnippet = {
  label: string;
  value: string;
};

export type QuickstartPackage = {
  id: string;
  title: string;
  packageId: PhonebookPackageId;
  intro: string;
  install: string;
  installCommands?: readonly CliInstallCommand[];
  steps: string[];
  commands?: string[];
  snippet?: QuickstartSnippet;
  tips?: string[];
};

export const quickstartContent = {
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".tutorials]
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series]
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series_brief]
  //rq:["../../../reqlan rq/site/site.rq".quickstart_page]
  title: "Get started",
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_01_why_reqlan]
  intro:
    "Install the editor extension. You can also install the CLI and the MCP server. All three use the same `.rq` files and the same `.reqlan` index.",
  defaultIde: defaultInstallIde,
  extension: extensionMeta,
  vsixDownloadUrl,
  ides: installActions.map(toQuickstartIde),
  //rq:["../../../reqlan rq/cli/cli_package.rq".cli_package]
  //rq:["../../../reqlan rq/site/site.rq".install_cli_menu]
  //rq:["../../../reqlan rq/core-architecture.rq".mcp_package]
  //rq:["../../../reqlan rq/phonebook.rq".phonebook]
  packages: [
    {
      id: "cli",
      title: "CLI",
      packageId: "cli",
      intro:
        "`@reqlan/cli` (`reqlan` / `rq`) searches, analyses, and exports the graph. It uses the same `.reqlan` index as the editor.",
      install: getCliInstallCommand("npm").command,
      installCommands: cliInstallCommands,
      steps: [
        "Install `@reqlan/cli` (or run `npx @reqlan/cli`).",
        "In a workspace, run `reqlan init` to create `.reqlan`.",
        "Search or analyse the graph. Pass `--cwd` or set `REQLAN_WORKSPACE` if you are not in the workspace root.",
      ],
      commands: [
        "reqlan init",
        "reqlan search <query>",
        "reqlan analyse [--file <path> | --idea <name>]",
        "reqlan export html",
      ],
      tips: [
        "Alias `rq` is the same binary.",
        "Override index storage with `REQLAN_INDEX_PATH` when needed.",
      ],
    },
    {
      id: "mcp",
      title: "MCP",
      packageId: "mcp",
      intro:
        "`@reqlan/mcp` is a stdio MCP server on that same index. No VS Code host is required.",
      install: getMcpInstallCommand("npm").command,
      installCommands: mcpInstallCommands,
      steps: [
        "Add the server to your MCP client, or in Cursor run Reqlan: Install Cursor Skills after you install the extension.",
        "Set `REQLAN_WORKSPACE` to the workspace root (or start the process from that directory).",
        "Ask the agent to click an idea, file, or search phrase. Pass the returned sessionKey on the next click.",
      ],
      snippet: {
        label: ".cursor/mcp.json",
        value: `{
  "mcpServers": {
    "reqlan": {
      "command": "npx",
      "args": ["-y", "@reqlan/mcp"],
      "env": {
        "REQLAN_WORKSPACE": "\${workspaceFolder}"
      }
    }
  }
}`,
      },
      tips: [
        "The retrieval tool is `click`. Status is `completion_status`.",
        "Override index storage with `REQLAN_INDEX_PATH` when needed.",
      ],
    },
  ] satisfies QuickstartPackage[],
  nextSteps: [
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_01_why_reqlan]
    {
      id: "why-reqlan",
      title: "Watch: Why requirements as code",
      detail: "Deck one of seven — then write your first idea.",
      href: "/tutorials/gs-01-why-reqlan",
    },
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_02_first_idea]
    {
      id: "first-idea",
      title: "Watch: Your first idea",
      detail: "One-liners and blocks in a `.rq` file.",
      href: "/tutorials/gs-02-first-idea",
    },
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_04_first_base]
    {
      id: "first-base",
      title: "Watch: Your first base",
      detail: "Create a reqlan base (`.reqlan`) so the ideas index has a home.",
      href: "/tutorials/gs-04-first-base",
    },
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_05_activity_bar]
    {
      id: "activity-bar",
      title: "Watch: Neighbourhood context",
      detail: "Open the activity bar, then try @reqlan / rq-* skills.",
      href: "/tutorials/gs-05-activity-bar",
    },
  ] satisfies QuickstartNextStep[],
  related: [
    {
      id: "tutorials",
      href: "/tutorials",
      label: "Tutorials",
      detail: "Short decks for the first-hour loop.",
    },
    {
      id: "showcase",
      href: "/showcase",
      label: "Showcases",
      detail: "Mechanisms against real domain problems.",
    },
    {
      id: "faq",
      href: "/faq",
      label: "FAQ",
      detail: "Token efficiency, when to use, how to support.",
    },
  ] satisfies QuickstartRelatedLink[],
} as const;

export type QuickstartContent = typeof quickstartContent;

export { installActions, vsixDownloadUrl };
