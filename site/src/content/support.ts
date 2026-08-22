// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/support-page.rq".support_page]
// rq:["../../../reqlan rq/site/certs.rq".assessment_page]
// rq:["../../../reqlan rq/site/certs.rq".sticker_form_embed]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]
import { mailtoWithSubject } from "@/lib/mailto";
import { getPhonebookLink, type PhonebookLinkId } from "@/lib/phonebook";

export function githubPathHref(githubHref: string, path: string): string {
  const root = githubHref.replace(/\/$/, "");
  const suffix = path.replace(/^\//, "");
  return `${root}/${suffix}`;
}

export function marketplaceReviewHref(marketplaceHref: string): string {
  const url = new URL(marketplaceHref);
  url.searchParams.set("ssr", "false");
  url.hash = "review-details";
  return url.toString();
}

export function openVsxReviewHref(openVsxHref: string): string {
  return `${openVsxHref.replace(/\/$/, "")}/reviews`;
}

export function citationText(siteHref: string, githubHref: string): string {
  return `reqlan\n${siteHref}\n${githubHref}`;
}

export function supportScore(ease: number, impact: number): number {
  return ease * impact;
}

export function supportNodeRadius(
  score: number,
  minScore: number,
  maxScore: number,
): number {
  const minR = 2;
  const maxR = 4.2;
  if (maxScore <= minScore) {
    return (minR + maxR) / 2;
  }
  const t = (score - minScore) / (maxScore - minScore);
  return minR + t * (maxR - minR);
}

export const supportGroupRadius = 1.1;

const site = getPhonebookLink("site");
const github = getPhonebookLink("github");
const email = getPhonebookLink("email");
const sponsors = getPhonebookLink("github-sponsors");
const discord = getPhonebookLink("discord");
const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");
const stickerForm = getPhonebookLink("sticker-form");

export type SupportGroupId =
  | "advocacy"
  | "community"
  | "cite"
  | "contribute"
  | "sponsor";

export type SupportView = "graph" | "tiles" | "table";

type SupportActionMeta = {
  id: string;
  title: string;
  blurb: string;
  iconId: PhonebookLinkId;
  ease: number;
  impact: number;
  groupId: SupportGroupId;
  graphTitle?: string;
};

export type SupportLinkAction = SupportActionMeta & {
  kind: "link";
  href: string;
};

export type SupportCopyAction = SupportActionMeta & {
  kind: "copy";
  text: string;
};

export type SupportShareAction = SupportActionMeta & {
  kind: "share";
  url: string;
  shareTitle: string;
};

export type SupportAction =
  | SupportLinkAction
  | SupportCopyAction
  | SupportShareAction;

export type SupportSection = {
  id: string;
  title: string;
  actions: readonly SupportAction[];
};

export type SupportGroup = {
  id: SupportGroupId;
  title: string;
};

const citation = citationText(site.href, github.href);

export const supportGroups = [
  { id: "advocacy", title: "Advocacy" },
  { id: "community", title: "Community" },
  { id: "cite", title: "Cite" },
  { id: "contribute", title: "Contribute" },
  { id: "sponsor", title: "Sponsor" },
] as const satisfies readonly SupportGroup[];

export const support = {
  title: "Support",
  lead: "You're a superstar! Thanks for offering your support.",
  viewsLabel: "Views",
  citation,
  views: {
    graph: "Graph",
    tiles: "Tiles",
    table: "Table",
  },
  table: {
    action: "Action",
    group: "Group",
  },
  sections: [
    {
      id: "one-click",
      title: "One click",
      actions: [
        {
          id: "star",
          title: "Github Star",
          blurb: "Star the GitHub repository.",
          iconId: "github",
          kind: "link",
          href: github.href,
          ease: 5,
          impact: 5,
          groupId: "advocacy",
        },
        {
          id: "share",
          title: "Share",
          blurb: "Share this site.",
          iconId: "site",
          kind: "share",
          url: site.href,
          shareTitle: "reqlan",
          ease: 5,
          impact: 4,
          groupId: "advocacy",
        },
        {
          id: "discord",
          title: "Discord",
          blurb: "Join the Discord server.",
          iconId: "discord",
          kind: "link",
          href: discord.href,
          ease: 4,
          impact: 3,
          groupId: "community",
        },
      ],
    },
    {
      id: "a-minute",
      title: "A minute",
      actions: [
        {
          id: "citation",
          title: "Citation",
          blurb: citation,
          iconId: "site",
          kind: "copy",
          text: citation,
          ease: 4,
          impact: 3,
          groupId: "cite",
        },
        {
          id: "issues",
          title: "Issues",
          blurb: "Report a defect or an idea.",
          iconId: "github",
          kind: "link",
          href: githubPathHref(github.href, "issues"),
          ease: 3,
          impact: 4,
          groupId: "contribute",
        },
        {
          id: "certificate",
          title: "Certificate",
          blurb: "Complete the assessment. Then share the certificate.",
          iconId: "site",
          kind: "link",
          href: "/certs/assessment",
          ease: 3,
          impact: 3,
          groupId: "advocacy",
        },
        {
          id: "vsc-review",
          title: "Say something nice",
          graphTitle: "Review:VSC",
          blurb: "Leave a Visual Studio Marketplace review.",
          iconId: "vsc",
          kind: "link",
          href: marketplaceReviewHref(vsc.href),
          ease: 4,
          impact: 4,
          groupId: "advocacy",
        },
        {
          id: "openvsx-review",
          title: "Open VSX",
          graphTitle: "Review:VSX",
          blurb: "Say something nice on Open VSX.",
          iconId: "openvsx",
          kind: "link",
          href: openVsxReviewHref(openvsx.href),
          ease: 4,
          impact: 3,
          groupId: "advocacy",
        },
        {
          id: "stickers",
          title: "FREE stickers",
          graphTitle: "FREE Stickers",
          blurb: "Show the world you're a reqling.",
          iconId: "sticker-form",
          kind: "link",
          href: stickerForm.href,
          ease: 4,
          impact: 4,
          groupId: "advocacy",
        },
      ],
    },
    {
      id: "write",
      title: "Write",
      actions: [
        {
          id: "email",
          title: "Email",
          blurb: "Send an email.",
          iconId: "email",
          kind: "link",
          href: email.href,
          ease: 3,
          impact: 2,
          groupId: "contribute",
        },
        {
          id: "testimonial",
          title: "Testimonial",
          blurb: "Send a short testimonial.",
          iconId: "email",
          kind: "link",
          href: mailtoWithSubject(email.href, "reqlan testimonial"),
          ease: 2,
          impact: 4,
          groupId: "contribute",
        },
      ],
    },
    {
      id: "sponsor",
      title: "Sponsor",
      actions: [
        {
          id: "github-sponsors",
          title: "Sponsors",
          blurb: "Give a one-time amount or a regular amount.",
          iconId: "github-sponsors",
          kind: "link",
          href: sponsors.href,
          ease: 3,
          impact: 5,
          groupId: "sponsor",
        },
        {
          id: "direct",
          title: "Direct",
          blurb: "Send an email to arrange a transfer.",
          iconId: "email",
          kind: "link",
          href: mailtoWithSubject(email.href, "reqlan sponsorship"),
          ease: 1,
          impact: 5,
          groupId: "sponsor",
        },
      ],
    },
  ] satisfies SupportSection[],
} as const;

export function flattenSupportActions(): SupportAction[] {
  return support.sections.flatMap((section) => [...section.actions]);
}

export function supportScoreRange(actions: readonly SupportAction[]): {
  min: number;
  max: number;
} {
  const scores = actions.map((action) =>
    supportScore(action.ease, action.impact),
  );
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

export function supportGroupById(
  id: SupportGroupId,
): (typeof supportGroups)[number] {
  const group = supportGroups.find((item) => item.id === id);
  if (!group) {
    throw new Error(`Unknown support group: ${id}`);
  }
  return group;
}

export function isFeaturedSupportAction(action: SupportAction): boolean {
  return action.id === "star" || action.groupId === "sponsor";
}

export function isFeaturedSupportGroup(id: SupportGroupId): boolean {
  return id === "sponsor";
}

export function supportGraphTitle(action: SupportAction): string {
  return action.graphTitle ?? action.title;
}
