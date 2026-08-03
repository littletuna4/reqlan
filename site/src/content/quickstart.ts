import {
  defaultInstallIde,
  extensionMeta,
  installActions,
  vsixDownloadUrl,
  type InstallAction,
  type QuickstartIconRef,
  type QuickstartIdeId,
} from "@/content/install-actions";

export type { InstallAction, QuickstartIconRef, QuickstartIdeId };

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

export const quickstartContent = {
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".tutorials]
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series]
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series_brief]
  title: "Get started",
  //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_01_why_reqlan]
  intro:
    "Install the reqlan extension, open a workspace with `.rq` files, and start tracing requirements in your editor.",
  defaultIde: defaultInstallIde,
  extension: extensionMeta,
  vsixDownloadUrl,
  ides: installActions.map(toQuickstartIde),
  nextSteps: [
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_02_first_idea]
    "Create or open a `.rq` file in your workspace.",
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_04_first_base]
    "Create a reqlan base (`.reqlan`) so the ideas index has a home.",
    //rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".gs_05_activity_bar]
    "Open the reqlan activity bar for neighbourhood context, then try @reqlan / rq-* skills.",
  ],
} as const;

export type QuickstartContent = typeof quickstartContent;

export { installActions, vsixDownloadUrl };
